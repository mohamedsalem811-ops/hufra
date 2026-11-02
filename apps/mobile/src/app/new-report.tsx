import { useRouter } from 'expo-router';

import { ReportFlow } from '@/features/report/report-flow';

export default function NewReportRoute() {
  const router = useRouter();
  return (
    <ReportFlow
      nav={{
        close: () => (router.canGoBack() ? router.back() : router.replace('/')),
        signIn: () => router.push('/auth/sign-in'),
        signUp: () => router.push('/auth/sign-up'),
        openReport: (id) => router.replace({ pathname: '/pothole/[id]', params: { id: String(id) } }),
      }}
    />
  );
}
