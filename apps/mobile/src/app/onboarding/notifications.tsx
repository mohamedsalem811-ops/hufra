import { Bell } from 'lucide-react-native';

import { useOnboarding } from '@/app-shell/onboarding';
import { requestNotifications } from '@/permissions/permissions';
import { PermissionStep } from '@/screens/onboarding/permission-step';

export default function NotificationsRoute() {
  const { complete } = useOnboarding();
  return (
    <PermissionStep
      step={2}
      total={2}
      icon={Bell}
      title="onboarding.notifications.title"
      body="onboarding.notifications.body"
      allowLabel="onboarding.notifications.allow"
      onAllow={requestNotifications}
      onDone={complete}
      onSkip={complete}
    />
  );
}
