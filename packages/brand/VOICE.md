# HUFRA voice and tone · صوت حفرة ونبرتها

How HUFRA speaks in the app, notifications, the website and the admin panel. Arabic comes first; English says the same thing, never more.

## Who we are, in one line

| العربية | English |
|---|---|
| **كل حفرة لها موقع.** نبلّغ عنها معاً، ونتابعها حتى تُصلح. | **Every pothole has a place.** We report it together and follow it until it's fixed. |

Primary tagline: **كل حفرة لها موقع** · *Every pothole has a place*.
Secondary (calls to action): **طرقٌ أفضل تبدأ ببلاغ** · *Better roads start with a report*.

## Four principles

| | Do | Don't |
|---|---|---|
| **Clear** | Short sentences, everyday words. One idea per sentence. | Jargon, acronyms, legal or technical terms. |
| **Respectful** | Thank people for reporting. Treat every report as useful. | Blame the reporter, the municipality or anyone else. |
| **Hopeful** | Show progress: what changed, what happens next. | Alarm, sarcasm, or complaining about the roads. |
| **Factual** | Say exactly what we know: status, date, place. | Promise repair dates we don't control, or exaggerate numbers. |

## Arabic

- Modern Standard Arabic, simple and warm. A light everyday touch is welcome in friendly moments ("شكراً لك!"), never slang in errors or legal text.
- Address the person directly and politely: **أنت** (not formal plural).
- Numbers: Western digits (0–9), as most people in Libya read them in apps. Dates: day month year (1 نوفمبر 2026).
- Keep the same word for the same thing everywhere (glossary below).

## English

- Plain, friendly British/International English. Sentence case for buttons and titles ("Report a pothole", not "Report A Pothole").
- Write as a translation of the Arabic meaning, not word for word.

## Glossary (use exactly these)

| Concept | العربية | English |
|---|---|---|
| Pothole | حفرة | pothole |
| A report | بلاغ | report |
| To report | بلّغ / أبلغ عن حفرة | report a pothole |
| Status: reported | تم الإبلاغ | Reported |
| Status: verified | تم التحقق | Verified |
| Status: under repair | قيد الإصلاح | Under repair |
| Status: fixed | تم الإصلاح | Fixed |
| Severity | خفيفة · متوسطة · خطيرة | Minor · Medium · Severe |
| "I saw it too" | تأكيد وجود الحفرة | Confirm pothole |
| Before / after (photos) | قبل · بعد | Before · After |
| Region / area | المنطقة / الحي | area |
| Account | حسابي | My account |

## Examples

**Buttons**: verbs, two or three words.
- ✅ بلّغ عن حفرة · *Report a pothole* | ✅ إرسال البلاغ · *Send report*
- ❌ اضغط هنا للإبلاغ · *Click here to submit your report now*

**Success**: thank, then say what happens next.
- ✅ شكراً! وصل بلاغك، وسنخبرك عند كل تحديث. · *Thanks! Your report is in. We'll let you know at every update.*

**Notifications**: what changed, where. Under 60 characters when possible.
- ✅ تم إصلاح الحفرة في [الشارع] · *The pothole on [street] is fixed*
- ❌ emoji or exclamation marks in system notifications

**Errors**: what happened, what to do. Never blame.
- ✅ لا يوجد اتصال. سنرسل البلاغ تلقائياً عند عودة الإنترنت. · *No connection. We'll send your report automatically when you're back online.*
- ❌ خطأ 500 · *Error 500* | ❌ أدخلت بيانات خاطئة · *You entered wrong data*

**Empty states**: invite, don't apologise.
- ✅ لا توجد بلاغات قريبة منك. شفت حفرة؟ بلّغ عنها. · *No reports near you yet. Seen a pothole? Report it.*

**Asking for permissions**: explain the benefit first.
- ✅ نحتاج موقعك لنضع الحفرة في المكان الصحيح على الخريطة. · *We use your location to put the pothole in the right place on the map.*

## Visual voice (brand rules, see `src/tokens.ts`)

- Signal orange is a fill for the main action and "reported"; text on it is always dark.
- Status is never shown by colour alone: badges have labels, map pins have glyphs.
- Photos first: before/after pairs are the story of a fixed report.
- No emoji in system text; icons come from the Lucide set.
