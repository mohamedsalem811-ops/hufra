import { render, screen } from '@testing-library/react-native';

import { Welcome } from './welcome';

describe('Welcome', () => {
  it('shows the app name as a heading and the tagline', async () => {
    await render(<Welcome />);
    expect(screen.getByRole('header', { name: 'حفرة' })).toBeTruthy();
    expect(screen.getByText('كل حفرة لها موقع.')).toBeTruthy();
  });
});
