// Builds the release APK on this computer, signed with the AudioStash key. CI runs it too.
//
//   pnpm mobile:release
//
// docs/deploy.md, "Build the app on your PC", has the one-time setup.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const mobileDir = fileURLToPath(new URL('..', import.meta.url));
const androidDir = join(mobileDir, 'android');
const releaseEnvFile = join(mobileDir, '.env.release');

// Production settings come from .env.release, not .env, which points at your local backend.
// Values already in the environment win, so CI can pass them without the file.
const fileValues = existsSync(releaseEnvFile) ? parseEnv(readFileSync(releaseEnvFile, 'utf8')) : {};
const env: NodeJS.ProcessEnv = { ...fileValues, ...process.env };

const problems: string[] = [];
if (!env.EXPO_PUBLIC_API_URL?.startsWith('https://')) {
  problems.push('EXPO_PUBLIC_API_URL must be the deployed API, starting with https://. A release build cannot reach a plain http address.');
}
if (!env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_')) {
  problems.push('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY must be set, starting with pk_.');
}
if (problems.length > 0) {
  console.error(`Set these in ${releaseEnvFile} or in the environment:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

// Counts the number of commits in the mobile directory. Commits grow with each release
// so it will install over the last. CI needs the full history for this (actions/checkout
// with fetch-depth: 0).
env.AUDIOSTASH_VERSION_CODE ??= execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: mobileDir, encoding: 'utf8' }).trim();

function run(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Deletes the android folder and writes it again from app.config.ts, including the release
// signing plugin and the version code. Always start clean: prebuild on an existing folder only
// adds, so a permission or plugin removed from the config would stay in the app.
// EXPO_NO_GIT_STATUS skips Expo's "uncommitted changes" prompt; android is git-ignored, so
// nothing in git is lost. Run through Node so it works the same on Windows and Linux.
const expoCli = createRequire(import.meta.url).resolve('expo/bin/cli');
env.EXPO_NO_GIT_STATUS = '1';
run(process.execPath, [expoCli, 'prebuild', '--platform', 'android', '--clean', '--no-install'], mobileDir);

// Builds the native code for arm64 only, the processor in every current Android phone.
// Otherwise it is built four times, also for 32-bit phones and x86 emulators, which makes the
// APK about three times larger and the build much slower. Debug builds are unaffected.
const gradleArgs = ['assembleRelease', '-PreactNativeArchitectures=arm64-v8a'];

// Windows runs .bat files only through cmd.exe. The arguments are fixed, so nothing is interpolated.
if (process.platform === 'win32') {
  run('cmd.exe', ['/d', '/c', 'gradlew.bat', ...gradleArgs], androidDir);
} else {
  run('./gradlew', gradleArgs, androidDir);
}

console.warn(`\nBuilt version ${env.AUDIOSTASH_VERSION_CODE}: ${join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')}`);
