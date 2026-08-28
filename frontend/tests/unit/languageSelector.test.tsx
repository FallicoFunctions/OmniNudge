import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { LanguageSelector } from '../../src/components/settings/LanguageSelector';
import { LANGUAGE_OPTIONS } from '../../src/i18n/languageUtils';

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

  // The picker used to offer Spanish and Arabic. Those locales are gone, so
  // there is no second option to switch to and no switching case to write.
  // Add a language back to LANGUAGE_OPTIONS and this asserts it is offered.
  it('offers exactly the supported languages', () => {
    render(<LanguageSelector />);
    const options = screen.getAllByRole('option').map((option) => ({
      code: (option as HTMLOptionElement).value,
      name: option.textContent,
    }));
    expect(options).toEqual(LANGUAGE_OPTIONS.map(({ code, name }) => ({ code, name })));
  });
});
