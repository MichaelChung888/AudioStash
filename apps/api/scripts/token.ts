// Prints a Clerk session token, for calling the API with curl or a REST client
// without the app. Only the token goes to stdout, so it can be captured:
//
//   TOKEN=$(pnpm --silent token)
//   curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/v1/status
//
// Each run creates a new Clerk session. Clerk allows this only on development instances.
import { parseArgs } from 'node:util';
import { createClerkClient } from '@clerk/backend';
import { loadEnv } from '../src/env.ts';

const { values } = parseArgs({
  options: {
    user: { type: 'string' },
    minutes: { type: 'string', default: '60' },
  },
});

const env = loadEnv();
const userId = values.user ?? env.CLERK_ALLOWED_USER_IDS[0];
if (!userId) throw new Error('Set CLERK_ALLOWED_USER_IDS or pass --user');

const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
const session = await clerk.sessions.createSession({ userId });
const { jwt } = await clerk.sessions.getToken(session.id, undefined, Number(values.minutes) * 60);

console.error(`Session ${session.id} for ${userId}, token valid for ${values.minutes} minutes.`);
console.log(jwt);
