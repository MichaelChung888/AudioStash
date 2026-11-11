import { unitConfig } from '../../vitest.shared.ts';

// Only modules with no React Native imports are unit tested; the rest needs a phone.
export default unitConfig;
