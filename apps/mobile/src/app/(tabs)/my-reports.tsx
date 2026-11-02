import { ClipboardList } from 'lucide-react-native';

import { OutboxList } from '@/features/outbox/outbox-list';
import { TabPlaceholder } from '@/screens/tab-placeholder';

/** Waiting reports now; the full list of sent reports arrives with the account screens (6.6). */
export default function MyReportsRoute() {
  return (
    <TabPlaceholder icon={ClipboardList} title="tabs.myReports" before={<OutboxList />} />
  );
}
