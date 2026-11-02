/**
 * App text. Arabic is the source; English must have exactly the same keys
 * (checked by a test). Wording follows packages/brand/VOICE.md.
 */
export const ar = {
  'app.name': 'حفرة',
  'app.tagline': 'كل حفرة لها موقع.',
  'language.switchTo': 'English',
  'language.switchToLabel': 'التبديل إلى الإنجليزية',
  'error.title': 'حدث خطأ غير متوقع',
  'error.body': 'المشكلة من جهتنا، وبياناتك بأمان. حاول مرة أخرى.',
  'error.retry': 'حاول مرة أخرى',
  'error.network': 'لا يوجد اتصال. تحقق من الإنترنت وحاول مرة أخرى.',
  'error.timeout': 'استغرق الطلب وقتاً طويلاً. حاول مرة أخرى.',
  'error.server': 'تعذّر الوصول إلى الخدمة الآن. حاول بعد قليل.',
  'error.signedOut': 'انتهت جلستك. سجّل الدخول مرة أخرى.',
} as const;

export type MessageKey = keyof typeof ar;

export const en: Record<MessageKey, string> = {
  'app.name': 'HUFRA',
  'app.tagline': 'Every pothole has a place.',
  'language.switchTo': 'العربية',
  'language.switchToLabel': 'Switch to Arabic',
  'error.title': 'Something went wrong',
  'error.body': "It's on our side and your data is safe. Please try again.",
  'error.retry': 'Try again',
  'error.network': 'No connection. Check your internet and try again.',
  'error.timeout': 'That took too long. Please try again.',
  'error.server': "We can't reach the service right now. Try again shortly.",
  'error.signedOut': 'Your session has ended. Please sign in again.',
};

export const messages = { ar, en } as const;
