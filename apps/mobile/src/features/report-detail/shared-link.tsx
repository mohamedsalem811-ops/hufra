import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * A shared report link (https://…/r/<id>, plan 8.5) opened in the app: show
 * that report. Anything that is not a report number goes to the home screen.
 */
export function SharedLinkRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (typeof id !== 'string' || !/^[1-9]\d{0,9}$/.test(id)) return <Redirect href="/" />;
  return <Redirect href={{ pathname: '/pothole/[id]', params: { id } }} />;
}
