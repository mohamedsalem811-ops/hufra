import { useLocalSearchParams } from 'expo-router';

import { ReportDetailScreen } from '@/features/report-detail/report-detail-screen';

export default function PotholeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ReportDetailScreen id={Number(id)} />;
}
