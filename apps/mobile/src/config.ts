function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not set. Copy apps/mobile/.env.example to apps/mobile/.env and fill it in.`);
  return value;
}

// Expo swaps process.env.EXPO_PUBLIC_* for the literal value when it bundles the app,
// and only finds them when each one is written out in full like this.
export const config = {
  apiUrl: required('EXPO_PUBLIC_API_URL', process.env.EXPO_PUBLIC_API_URL).replace(/\/+$/, ''),
  clerkPublishableKey: required('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY', process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY),
  chartCountry: (process.env.EXPO_PUBLIC_CHART_COUNTRY || 'gb').toLowerCase(),
};
