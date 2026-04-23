import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const DISMISS_KEY = 'zwaggen.banner.demo.v1';
const DESKTOP_URL = 'https://docs.zwaggen.com/guide/desktop';

export function DemoBanner() {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(typeof window !== 'undefined' && localStorage.getItem(DISMISS_KEY) !== '1');
  }, []);

  if (!show) return null;
  return (
    <div className="border-b border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
      <div className="mx-auto flex max-w-screen-2xl items-center gap-2">
        <span className="flex-1">
          {t('demoBannerText')}{' '}
          <a
            href={DESKTOP_URL}
            target="_blank"
            rel="noreferrer"
            className="font-semibold underline"
          >
            {t('demoBannerCta')}
          </a>
        </span>
        <button
          type="button"
          aria-label={t('dismiss')}
          className="px-1 text-indigo-600 transition hover:text-indigo-900"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, '1');
            setShow(false);
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
