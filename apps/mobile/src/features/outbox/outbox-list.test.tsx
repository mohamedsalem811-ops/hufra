import { render, screen } from '@testing-library/react-native';

import { AppProviders } from '@/app-shell/providers';

import { OutboxList } from './outbox-list';
import { OutboxProvider } from './outbox-provider';
import { newOutboxItem } from './processor';
import { memoryOutbox } from './store';

const base = { lat: 32.89, lng: 13.19, severity: 'medium' as const };
const photo = { uri: 'file:///documents/outbox/a/photo-1.jpg', width: 1280, height: 960 };
const state = { reportId: null, uploadToken: null, uploaded: 0 };

describe('OutboxList', () => {
  it('shows waiting and refused reports with what happens next', async () => {
    const waiting = newOutboxItem('a', { ...base, street_ar: 'شارع الجمهورية', client_report_uuid: 'a' }, [photo], state);
    const refused = { ...newOutboxItem('b', { ...base, client_report_uuid: 'b' }, [photo, photo], state), status: 'failed' as const, lastError: 'بيانات غير صحيحة' };
    await render(
      <AppProviders locale="ar" themeMode="light">
        <OutboxProvider store={memoryOutbox([waiting, refused])}>
          <OutboxList />
        </OutboxProvider>
      </AppProviders>,
    );
    expect(await screen.findByText('شارع الجمهورية')).toBeTruthy();
    expect(screen.getByText('يُرسل تلقائياً عند عودة الإنترنت')).toBeTruthy();
    expect(screen.getByText('تعذّر الإرسال')).toBeTruthy();
    expect(screen.getByText('بيانات غير صحيحة')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'حذف' })).toBeTruthy();
  });

  it('shows nothing when no report is waiting', async () => {
    await render(
      <AppProviders locale="ar" themeMode="light">
        <OutboxProvider store={memoryOutbox()}>
          <OutboxList />
        </OutboxProvider>
      </AppProviders>,
    );
    expect(screen.queryByText('بانتظار الإرسال')).toBeNull();
  });
});
