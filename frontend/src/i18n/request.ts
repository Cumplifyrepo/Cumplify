import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => {
  // TODO: Read locale from PROFILE# item (server component fetch)
  // Fallback chain: user profile → tenant default → 'en'
  const locale = 'en';

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
