import { useLocalSearchParams } from 'expo-router';

import { ReportDetailBasic } from '@/features/reports/report-detail-basic';

export default function PotholeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ReportDetailBasic id={Number(id)} />;
}
