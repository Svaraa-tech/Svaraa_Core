import { fireEvent, screen } from '@testing-library/react-native';
import i18n from '@/i18n';
import { NewsView } from '@/features/news/NewsView';
import { useNewsFilters } from '@/features/news/store';
import { verifyOtpAndSignIn } from '@/services/auth/authApi';
import { DEMO_CODE } from '@/services/mocks/routes';
import { INDIA, useMockBackend } from '@/test-utils/backend';
import { renderApp } from '@/test-utils/render';

beforeEach(async () => {
  await i18n.changeLanguage('en');
  useNewsFilters.setState({ category: 'all', language: 'app' });
  await useMockBackend();
  // Like the server, news needs sign-in.
  await verifyOtpAndSignIn(INDIA, DEMO_CODE);
});

describe('News', () => {
  it('shows headlines in the app language and filters by category', async () => {
    await renderApp(<NewsView />);
    expect(await screen.findByText(/Global health body/)).toBeTruthy();
    expect(screen.queryByText(/नमूना/)).toBeNull();
    // Chips are the server's categories.
    await fireEvent.press(await screen.findByRole('radio', { name: 'Sports' }));
    expect(await screen.findByText(/Cricket team names its squad/)).toBeTruthy();
    expect(screen.queryByText(/Global health body/)).toBeNull();
    expect(useNewsFilters.getState().category).toBe('sports');
  });

  it('switches to Hindi headlines', async () => {
    await renderApp(<NewsView />);
    await fireEvent.press(await screen.findByRole('radio', { name: 'हिन्दी' }));
    expect(await screen.findByText(/वैश्विक सलाह/)).toBeTruthy();
    expect(useNewsFilters.getState().language).toBe('hi');
  });

  it('searches by keyword', async () => {
    await renderApp(<NewsView />);
    await screen.findByText(/Global health body/);
    await fireEvent.changeText(screen.getByLabelText('Search news'), 'walking');
    await fireEvent(screen.getByLabelText('Search news'), 'submitEditing');
    expect(await screen.findByText(/daily walking/)).toBeTruthy();
    expect(screen.queryByText(/Global health body/)).toBeNull();
  });
});
