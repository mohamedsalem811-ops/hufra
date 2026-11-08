# Device test checklist (plan 9.3)

Every journey of HUFRA, tried by a person on real phones before the store
releases (Phase 10). The automated tests (see [TESTING.md](TESTING.md)) already
walk these on an emulator and in browsers; this pass is for what only a real
phone shows: the camera, GPS, real network loss, push, the in-app browser,
fonts and right-to-left layout on your own screen.

Button names are given as they appear in the app, Arabic first, then English.

## How to run this pass

1. **Builds.** Open GitHub → Actions → **App build** → the latest run on `main`
   → Artifacts. Download `HUFRA-Android-APK` and `HUFRA-iOS-IPA`.
   - Android: unzip, open the `.apk` on the phone, allow installing from this
     source. If an older HUFRA test build is installed it updates in place.
   - iPhone: install the `.ipa` with Sideloadly and your Apple ID, then on the
     phone: Settings → General → VPN & Device Management → trust it. It stops
     opening after 7 days; install again to refresh.
2. **Passes.** Do the whole list **in Arabic on Android**, then **in Arabic on
   iPhone**. Then do the shorter [English pass](#english-pass) on one phone (or
   both if you have time). Items marked *Android only* cannot work on a
   sideloaded iPhone build (see the table in the plan, "What sideload testing
   can and cannot show").
3. **Accounts.** Use two citizen accounts you create during the test (for
   example `you+a@gmail.com` and `you+b@gmail.com`; Gmail delivers both to
   you), and your super admin account for the admin panel on a computer.
   Never use the admin account in the app.
4. **Real data.** This is the live service. Everything you create (reports,
   donations) is real data; at the end, [clean up](#clean-up).
5. **When something is wrong**, write down the item number (for example
   `C7`), the phone, the language, what you expected and what happened, and
   take a screenshot. Send me the list in the chat. Never send passwords or
   bank details in the chat.

Mark each item: ✅ works, ❌ wrong (with a note), ➖ not tried.

---

## A. First start

- [ ] **A1** Install and open the app. The first screen is the introduction:
  "صوّر الحفرة" (Photograph the pothole), with "الخطوة 1 من 3" (Step 1 of 3).
- [ ] **A2** Swipe through the three steps; "تخطّي" (Skip) jumps to the end.
- [ ] **A3** "ابدأ" (Get started) → the location screen. "السماح بالموقع"
  (Allow location) shows the phone's own question; allow "While using the app".
- [ ] **A4** The notifications screen. "تفعيل الإشعارات" (Turn on
  notifications) → the phone's question → allow. (On iPhone the question
  appears but push will not arrive on a sideloaded build.)
- [ ] **A5** You land on Home with five tabs: الرئيسية، الخريطة، بلّغ،
  بلاغاتي، حسابي. The tab bar is right to left (Home on the right).
- [ ] **A6** Close the app fully and open it again: the introduction does not
  come back.
- [ ] **A7** Delete and reinstall the app, and this time answer "ليس الآن"
  (Not now) to both questions. The app still works; location and
  notifications can be allowed later (see H3).

## B. Browsing without an account

- [ ] **B1** Home shows the three numbers (بانتظار الإصلاح، قيد الإصلاح، تم
  إصلاحه), "أُصلحت مؤخراً" (Recently fixed) and "قريب منك" (Near you). Numbers
  are Western digits (1, 2, 3).
- [ ] **B2** Pull down to refresh Home: the numbers reload.
- [ ] **B3** "الأرقام الكاملة للشفافية" opens the website's transparency page.
- [ ] **B4** Map tab: the map of Tripoli with coloured pins; zoomed out, pins
  group into numbered circles; tapping a circle zooms in.
- [ ] **B5** Tap a pin → a card with the status, street, date and "عرض
  التفاصيل" (View details).
- [ ] **B6** "قريب مني" (Near me) moves the map to where you are.
- [ ] **B7** "الفلاتر" (Filters): choose a status, a severity and a region →
  "عرض {n} بلاغ". The button then reads "الفلاتر، {n} مفعّل" and only matching
  pins show. "مسح الكل" (Clear all) brings all back.
- [ ] **B8** Open a report's details: photos (swipe; tap for full size, close),
  status timeline "مراحل البلاغ", location card. For a fixed one with an after
  photo: "قارن قبل وبعد", and the slider moves.
- [ ] **B9** "الاتجاهات" (Directions): on iPhone you can choose Apple or
  Google Maps; on Android Google Maps opens at the pothole.
- [ ] **B10** "مشاركة" (Share): the phone's share sheet with a
  `https://hufra.mohamedsalem811.workers.dev/r/<number>` link.
- [ ] **B11** Without an account, "تأكيد وجود الحفرة" shows "سجّل الدخول
  لتأكيد وجودها" (Sign in to confirm).
- [ ] **B12** "بلّغ" (Report) tab and "بلاغاتي" (My reports) ask you to sign
  in; nothing breaks.

## C. Account

- [ ] **C1** Sign up from the Report tab: "إنشاء حساب جديد" → email, password,
  name (optional), tick the consent box → "إنشاء الحساب". Without the tick you
  see "وافق على الشروط لإنشاء الحساب".
- [ ] **C2** "اقرأ الشروط" / "اقرأ سياسة الخصوصية" open the website pages.
- [ ] **C3** After signing up you return to where you were (the report form),
  not to Home.
- [ ] **C4** حسابي (My account) shows "مسجّل الدخول باسم <your email>" and
  your code.
- [ ] **C5** Sign out ("تسجيل الخروج"), then sign in with a wrong password:
  "البريد أو كلمة المرور غير صحيحة." Then the right one works.
- [ ] **C6** Sign up again with the same email: "هذا البريد مسجّل…".
- [ ] **C7** Password shorter than 8 letters, or a very common one like
  `password123`: refused with a clear message.
- [ ] **C8** Close the app, wait a day (or at least an hour), open it: you are
  still signed in.
- [ ] **C9** The eye button shows and hides the password; it is read out by
  the screen reader (see J).

## D. Reporting a pothole (online)

Stand near a real pothole if you can, or test at home and delete the report
afterwards (see [clean up](#clean-up)).

- [ ] **D1** بلّغ → "بلاغ جديد", step "الموقع". The map centres on you and
  shows "دقة الموقع: حوالي {m} م".
- [ ] **D2** Move the map; the pin stays in the centre; the street name
  updates. "موقعي الحالي" brings it back to you. "تأكيد الموقع".
- [ ] **D3** Photos: "الكاميرا" opens the camera; take a photo. "المعرض" lets
  you pick. Up to three; "{n} من 3 صور"; a fourth is not possible. Remove one
  with its × button.
- [ ] **D4** Turn the phone sideways while taking a photo: the photo is the
  right way up afterwards.
- [ ] **D5** Details: severity (three choices with explanations), street,
  short description, width and depth. Leave optional ones empty → still OK.
- [ ] **D6** Review: everything you entered; "تعديل" (Edit) on a section goes
  back to it and keeps the rest.
- [ ] **D7** "إرسال البلاغ": "نرسل البلاغ…" then "نرفع الصورة 1 من 3…", then
  "شكراً! وصل بلاغك" with the report number.
- [ ] **D8** "عرض البلاغ" opens it with "بلاغك" (Your report) and "تم الإبلاغ"
  status; the photos are there and look sharp.
- [ ] **D9** It appears in بلاغاتي with the right counters, and on the map.
- [ ] **D10** Start a report and press "إغلاق" (Close) halfway: "الخروج من
  البلاغ؟" with "خروج" and "متابعة البلاغ".
- [ ] **D11** Deny the camera in the phone's settings, try "الكاميرا": the
  message "لا نستطيع فتح الكاميرا…" and the gallery still works.
- [ ] **D12** Turn location off for the app: the report still works by moving
  the map yourself ("لم نصل إلى موقعك…").

## E. Reporting with no connection (the outbox)

- [ ] **E1** Turn on airplane mode. Make a full report with photos → "إرسال
  البلاغ". You see "حفظنا بلاغك على هاتفك" and "حسناً".
- [ ] **E2** بلاغاتي shows it under "بانتظار الإرسال" with "يُرسل تلقائياً عند
  عودة الإنترنت".
- [ ] **E3** Close the app completely. Turn airplane mode off. Open the app:
  the report is sent by itself, leaves the waiting list and appears once (not
  twice) among your reports and on the map.
- [ ] **E4** Again offline, save a report; then go online with the app open
  (do not close it): it is sent within a few seconds.
- [ ] **E5** Offline, save a report, then "أرسل الآن" (Send now) while still
  offline: it stays waiting, no duplicate, no crash.
- [ ] **E6** Offline, save a report, then "حذف" (Delete) →
  "حذف هذا البلاغ من هاتفك؟" → it is gone and never sent.
- [ ] **E7** Weak signal: start sending, then turn on airplane mode in the
  middle of "نرفع الصورة…". The report waits; once back online it finishes,
  with all its photos, as one report.
- [ ] **E8** Restart the phone with a report waiting, then open the app
  online: it is still sent.
- [ ] **E9** Offline, browse: Home and the map show a clear "لا يوجد اتصال…"
  message with "حاول مرة أخرى"; the app does not freeze or close.

## F. Confirming a pothole ("I saw it too")

- [ ] **F1** Signed in as account **B**, open a report made by account **A**:
  "تأكيد وجود الحفرة" → "أكدت وجودها. شكراً لك", and the count goes up by one.
- [ ] **F2** Close and reopen the report: it still shows you confirmed, and you
  cannot confirm twice.
- [ ] **F3** On your own report there is no confirm button, only "بلاغك".
- [ ] **F4** A fixed report has no confirm button.

## G. Following a report (status changes and push)

On a computer, sign in to the admin panel:
`https://hufra.mohamedsalem811.workers.dev/admin`.

- [ ] **G1** البلاغات (Reports) → open the report from D7 → "تغيير الحالة" →
  "تم التحقق", write a note, keep "إرسال إشعار للمُبلِّغ" ticked → "حفظ الحالة".
- [ ] **G2** *Android only:* within a minute a notification arrives on the
  phone in the app's language, even with the app closed.
- [ ] **G3** *Android only:* tapping the notification opens that report.
- [ ] **G4** In the app, the report shows "تم التحقق" and "ملاحظة الفريق:
  <your note>"; حسابي → "الإشعارات" shows it with a new-count badge; "قراءة
  الكل" clears it.
- [ ] **G5** Repeat with "قيد الإصلاح", then "تم الإصلاح" with an after photo:
  the app shows the before/after compare and "أُصلحت خلال…".
- [ ] **G6** Settings → turn off "تحديثات بلاغاتي". Change a status again: no
  push on the phone (the in-app list still records it). Turn it back on.
- [ ] **G7** *Android only:* sign out on the phone, change a status: no push
  reaches the signed-out phone.

## H. Settings and account

- [ ] **H1** حسابي → "اللغة": English. The whole app turns left to right at
  once, including the tab bar; back to العربية.
- [ ] **H2** "المظهر": فاتح / داكن / تلقائي. Every screen is readable in dark,
  including the map and the report form. "تلقائي" follows the phone.
- [ ] **H3** الإعدادات → "الأذونات" shows location, camera and notifications as
  مسموح / غير مسموح / لم يُطلب بعد. "افتح إعدادات الهاتف" opens the phone's
  settings for HUFRA; changing a permission there shows here when you come
  back.
- [ ] **H4** "حجم الخط": عادي / كبير / أكبر. Text grows on every screen and
  nothing is cut off. Also try the phone's own largest text size.
- [ ] **H5** "تنزيل نسخة من بياناتي" gives a file you can save or send; it
  contains your account and reports.
- [ ] **H6** "عن حفرة", "الأمان والخصوصية", "الشروط وقواعد التبرع", "موقع حفرة"
  open the right website pages. "الإصدار …" shows the version.

## I. Donating

First, in the admin panel → الإعدادات وسجل التدقيق, check the bank details
are filled in, "التبرعات مفتوحة" is on, and note the two choices "فتح صفحة
التبرع على iPhone / Android" (داخل التطبيق or في متصفح الهاتف). Then in
حملات الإصلاح start a campaign on a verified report ("بدء حملة إصلاح").

- [ ] **I1** In the app, the report shows "حملة الإصلاح" with the goal,
  "تبرّع لإصلاحها" and amounts as `1,200 د.ل`.
- [ ] **I2** "تبرّع لإصلاحها" opens the donation page already signed in
  (no second sign-in), in the app's language, inside the app or in the phone's
  browser as set in the admin panel. Try both settings.
- [ ] **I3** Choose an amount → the bank transfer step with the reference code,
  IBAN and account number. Each "نسخ" (Copy) button copies the right text
  (paste it into Notes to check).
- [ ] **I4** Upload a screenshot of a transfer (any real screenshot from your
  bank app; it is checked by a person, not by a machine). "قيد المراجعة".
- [ ] **I5** In the app: حسابي → "تبرعاتي" lists it as "قيد المراجعة".
- [ ] **I6** Admin panel → مراجعة التبرعات → open it → "تأكيد التبرع". On the
  phone it becomes "مؤكد", the campaign's confirmed amount grows, and (*Android
  only*) a push arrives if "تحديثات تبرعاتي" is on.
- [ ] **I7** Make a second donation and reject it in the admin panel with a
  reason: the app shows "تعذّر التحقق" and "السبب: …".
- [ ] **I8** Start a third donation and cancel it before uploading: "أُلغي".
- [ ] **I9** Open the same donation page link in the phone's browser while
  signed out: it asks you to sign in on the website ("تسجيل الدخول"), then
  continues.
- [ ] **I10** Upload the same screenshot for another donation: refused with
  "هذه الصورة استُخدمت لتبرع آخر" (expected).

## J. Screen reader and accessibility

Turn on TalkBack (Android) or VoiceOver (iPhone) and try, in Arabic:

- [ ] **J1** Home, map, report form and report details: every button is read
  with a meaningful name in Arabic (no "button" alone, no English in the
  Arabic app).
- [ ] **J2** The map pins and groups are read ("مجموعة من {n} بلاغ، اضغط
  للتكبير").
- [ ] **J3** A full report can be made with the screen reader on.
- [ ] **J4** Error messages (wrong password, no connection) are read out when
  they appear.

## K. Shared links

- [ ] **K1** Share a report to yourself on WhatsApp: a preview card with the
  photo and the area shows.
- [ ] **K2** *Android only:* tapping the link opens the report in the app.
- [ ] **K3** On iPhone (and on a phone without the app), the link opens the
  website's report page with "Open in the app / Get the app".

## L. Website on the phone

In the phone's browser (Safari and Chrome):

- [ ] **L1** `https://hufra.mohamedsalem811.workers.dev`: home, how it works,
  transparency, contact, FAQ, terms and privacy load; the menu works; no
  sideways scrolling.
- [ ] **L2** The language switch at the top moves between Arabic and English
  on the same page.
- [ ] **L3** Old addresses still lead somewhere sensible: `/map` → home,
  `/login` → sign-in, `/pothole/<number>` → that report.
- [ ] **L4** If you ever opened the old site on this phone before: open it
  once; it reloads as the new site and stays the new site.

## M. Odd situations

- [ ] **M1** Lock the phone during a report and come back: the draft is still
  there.
- [ ] **M2** Switch to another app while photos upload and come back: the
  upload finishes or waits in the outbox, never twice.
- [ ] **M3** Leave the app unused a day, open it on a report: it loads without
  asking to sign in again.
- [ ] **M4** Delete your account (account **B** only): حسابي → "حذف حسابي" →
  "حذف حسابك نهائياً؟" → "احذف حسابي". You are signed out with
  "حُذف حسابك…", and signing in with that email no longer works.

---

## English pass

On one phone, switch the app to English (حسابي → اللغة) and check each of
these looks right **left to right**, with English words everywhere and money
as `1,200 LYD`:

- [ ] **EN1** Introduction (reinstall, or see it once on the second phone)
- [ ] **EN2** Home, map with filters, a report's details
- [ ] **EN3** Sign in, sign up and their error messages
- [ ] **EN4** A full report, online and once offline (outbox message)
- [ ] **EN5** My reports, notifications, settings, account
- [ ] **EN6** *Android only:* a push notification arrives in English
- [ ] **EN7** Donate: the website page opens in English (`/en/donate/…`)
- [ ] **EN8** The screen reader reads English names

## Clean up

When the pass is done:

1. In the admin panel, delete the test reports and cancel the test campaign
   (البلاغات / حملات الإصلاح). Rejected and cancelled donations can stay; they
   are not counted anywhere.
2. Delete account **A** from the app (حسابي → حذف حسابي); **B** was deleted in M4.
3. If you entered test bank details only for this pass, replace them with the
   real ones before Phase 10, or turn "التبرعات مفتوحة" off.

## Results

| Phone | Language | Date | Build (run number) | Problems (item numbers) |
|---|---|---|---|---|
| Android: | Arabic | | | |
| iPhone: | Arabic | | | |
| | English | | | |
