/**
 * Honest-miss template loader — spec-35 INV-2.
 * Returns locale-aware templates that make NO factual claims about standards.
 * Locale source: tenant documentLocale (spec-41 T8 precedent), passed via InvokeRequest.locale.
 */

export type SupportedLocale = 'en' | 'es' | 'pt';

const HONEST_MISS_TEMPLATES: Record<SupportedLocale, string> = {
  en: `I was unable to provide a sufficiently grounded answer to your question. The information available in the knowledge base did not meet the confidence threshold required for this type of response.

**What you can do:**
- Rephrase your question with more specific terms
- Contact your IMS Lead for guidance on this topic
- Check the relevant standard clause directly

_This response was generated because the AI system's grounding check indicated insufficient evidence to support a reliable answer._`,

  es: `No fue posible proporcionar una respuesta con fundamento suficiente a su consulta. La informacion disponible en la base de conocimiento no alcanzo el umbral de confianza requerido para este tipo de respuesta.

**Que puede hacer:**
- Reformule su pregunta con terminos mas especificos
- Contacte a su Representante del SIG para orientacion sobre este tema
- Consulte directamente la clausula relevante de la norma

_Esta respuesta fue generada porque la verificacion de fundamentacion del sistema de IA indico evidencia insuficiente para respaldar una respuesta confiable._`,

  pt: `Nao foi possivel fornecer uma resposta com fundamentacao suficiente para sua consulta. As informacoes disponiveis na base de conhecimento nao atingiram o limiar de confianca exigido para este tipo de resposta.

**O que voce pode fazer:**
- Reformule sua pergunta com termos mais especificos
- Entre em contato com seu Representante do SGI para orientacao sobre este tema
- Consulte diretamente a clausula relevante da norma

_Esta resposta foi gerada porque a verificacao de fundamentacao do sistema de IA indicou evidencia insuficiente para sustentar uma resposta confiavel._`,
};

/**
 * Get the honest-miss template for a given locale.
 * Falls back to English if locale is not recognized.
 */
export function getHonestMissTemplate(locale?: string): string {
  const supported = locale as SupportedLocale;
  return HONEST_MISS_TEMPLATES[supported] ?? HONEST_MISS_TEMPLATES['en'];
}
