import { fireEvent, render, screen } from '@testing-library/react-native';

import { AppProviders } from '@/app-shell/providers';

import { FilterSheet } from './filter-sheet';
import { DEFAULT_FILTERS } from './filters';
import { report } from './test-fixtures';
import { ReportPreview } from './report-preview';

describe('ReportPreview', () => {
  it('shows status, street, area, severity and date, and opens the details', async () => {
    const onOpen = jest.fn();
    const onClose = jest.fn();
    await render(
      <AppProviders locale="ar" themeMode="light">
        <ReportPreview report={report({ id: 7, status: 'verified', severity: 'severe', upvotes_count: 3 })} onOpen={onOpen} onClose={onClose} />
      </AppProviders>,
    );
    expect(screen.getByText('تم التحقق')).toBeTruthy();
    expect(screen.getByText('شارع عمر المختار')).toBeTruthy();
    expect(screen.getByText('وسط المدينة · خطيرة')).toBeTruthy();
    expect(screen.getByText('3 أكدوا وجودها')).toBeTruthy();
    expect(screen.getByText(/^أُبلغ عنها 1/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'عرض التفاصيل' }));
    await fireEvent.press(screen.getByRole('button', { name: 'إغلاق' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('names an unnamed street in English', async () => {
    await render(
      <AppProviders locale="en" themeMode="dark">
        <ReportPreview report={report({ id: 8, street_ar: null, street_en: null })} onOpen={jest.fn()} onClose={jest.fn()} />
      </AppProviders>,
    );
    expect(screen.getByText('Unnamed street')).toBeTruthy();
    expect(screen.getByText('City centre · Medium')).toBeTruthy();
  });
});

describe('FilterSheet', () => {
  it('applies the chosen filters together, with a live count', async () => {
    const onApply = jest.fn();
    await render(
      <AppProviders locale="en" themeMode="light">
        <FilterSheet
          visible
          value={DEFAULT_FILTERS}
          regions={[]}
          countFor={(f) => f.statuses.length * 10}
          onApply={onApply}
          onClose={jest.fn()}
        />
      </AppProviders>,
    );
    expect(screen.getByRole('button', { name: 'Show 40 reports' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Fixed' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Severe' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Show 30 reports' }));
    expect(onApply).toHaveBeenCalledWith({
      statuses: ['reported', 'verified', 'under_repair'],
      severities: ['minor', 'medium'],
      regionId: null,
    });
  });
});
