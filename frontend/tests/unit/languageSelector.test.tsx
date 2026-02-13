import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { LanguageSelector } from '../../src/components/settings/LanguageSelector';

const changeLanguage = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: {
      language: 'en-US',
      resolvedLanguage: 'en',
      changeLanguage,
    },
    t: (key: string) => key,
  }),
}));

describe('LanguageSelector', () => {
  beforeEach(() => {
    changeLanguage.mockReset();
  });

  it('renders normalized selected language', () => {
    render(<LanguageSelector />);
    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('en');
  });

  it('changes language from dropdown selection', () => {
    render(<LanguageSelector />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'es' } });
    expect(changeLanguage).toHaveBeenCalledWith('es');
  });
});
