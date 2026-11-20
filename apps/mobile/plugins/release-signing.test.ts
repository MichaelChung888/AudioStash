import { describe, expect, it } from 'vitest';
import { addReleaseSigning } from './release-signing.ts';

// The parts of Expo's generated android/app/build.gradle that the plugin changes.
const TEMPLATE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            shrinkResources enableShrinkResources.toBoolean()
        }
    }
}
`;

describe('addReleaseSigning', () => {
  it('signs release builds with the release config and leaves debug builds alone', () => {
    const result = addReleaseSigning(TEMPLATE);

    expect(result).toContain("project.findProperty('AUDIOSTASH_STORE_FILE')");
    expect(result.match(/signingConfig signingConfigs\.debug/g)).toHaveLength(1);
    expect(result).toMatch(/release \{\n {12}\/\/ Caution![\s\S]*?signingConfig signingConfigs\.release/);
  });

  it('changes nothing the second time', () => {
    const once = addReleaseSigning(TEMPLATE);

    expect(addReleaseSigning(once)).toBe(once);
  });

  it('throws when the template no longer matches', () => {
    expect(() => addReleaseSigning('android {}')).toThrow(/expected layout/);
  });
});
