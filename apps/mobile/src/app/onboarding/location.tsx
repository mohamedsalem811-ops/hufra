import { useRouter } from 'expo-router';
import { MapPin } from 'lucide-react-native';

import { useOnboarding } from '@/app-shell/onboarding';
import { requestLocation } from '@/permissions/permissions';
import { PermissionStep } from '@/screens/onboarding/permission-step';

export default function LocationRoute() {
  const router = useRouter();
  const { complete } = useOnboarding();
  return (
    <PermissionStep
      step={1}
      total={2}
      icon={MapPin}
      title="onboarding.location.title"
      body="onboarding.location.body"
      points={['onboarding.location.point1', 'onboarding.location.point2', 'onboarding.location.point3']}
      allowLabel="onboarding.location.allow"
      onAllow={requestLocation}
      onDone={() => router.push('/onboarding/notifications')}
      onSkip={complete}
    />
  );
}
