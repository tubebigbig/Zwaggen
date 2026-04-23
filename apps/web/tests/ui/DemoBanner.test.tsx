import { afterEach, beforeEach, expect, test } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { DemoBanner } from '../../src/ui/DemoBanner';
import i18n from '../../src/i18n';

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

function withI18n(node: React.ReactNode) {
  return <I18nextProvider i18n={i18n}>{node}</I18nextProvider>;
}

test('renders by default and links to the desktop coming-soon page', () => {
  render(withI18n(<DemoBanner />));
  const link = screen.getByRole('link');
  expect(link.getAttribute('href')).toBe('https://docs.zwaggen.com/guide/desktop');
});

test('dismiss persists in localStorage and hides the banner', () => {
  const { container } = render(withI18n(<DemoBanner />));
  fireEvent.click(screen.getByLabelText(/dismiss/i));
  expect(localStorage.getItem('zwaggen.banner.demo.v1')).toBe('1');
  expect(container.querySelector('a')).toBeNull();
});

test('does not render when previously dismissed', () => {
  localStorage.setItem('zwaggen.banner.demo.v1', '1');
  const { container } = render(withI18n(<DemoBanner />));
  expect(container.querySelector('a')).toBeNull();
});
