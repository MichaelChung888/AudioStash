import { Redirect } from 'expo-router';

// Social sign-in returns to audiostash://sso-callback. Clerk reads the result from the
// browser tab, but Expo Router also opens the link as a route, so this route passes it
// on to the app. Otherwise the app shows "Unmatched route" after signing in.
export default function SsoCallback() {
  return <Redirect href="/" />;
}
