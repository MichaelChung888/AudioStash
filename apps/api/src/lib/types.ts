import type { Services } from '../context.ts';
import type { SignedInUser } from '../services/clerk.ts';
import type { Logger } from './logger.ts';

// Values handlers read with c.get(...). `user` is set by requireUser, so it is
// only present on routes behind that middleware.
export interface AppEnv {
  Variables: {
    services: Services;
    log: Logger;
    user: SignedInUser;
  };
}
