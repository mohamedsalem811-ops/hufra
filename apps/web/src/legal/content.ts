// Plan 8.4c: the legal pages, written against Libyan Law No. 6 of 2022 on
// electronic transactions (its personal-data chapter) and Law No. 5 of 2022 on
// cybercrime. A draft until a Libyan lawyer has reviewed it.
//
// {slot} marks a value from the admin panel's legal information (or contact
// settings). The page shows the default or a bracketed label; the browser fills
// the published value (see scripts/legal.ts).
import type { Locale } from '../i18n/i18n'

export type LegalPage = 'privacy' | 'terms' | 'donation-rules' | 'delete-account'
export const LEGAL_PAGES: LegalPage[] = ['privacy', 'terms', 'donation-rules', 'delete-account']

export type Slot = 'name' | 'address' | 'reg' | 'courts' | 'fin' | 'shots' | 'wrong' | 'reply' | 'email'

export type Block =
  | { h2: string }
  | { p: string; if?: Slot }
  | { ul: string[] }
  /** Numbered rules, each with a short bold label. */
  | { ol: [string, string][] }
  | { table: { id: string; caption: string; head: string[]; rows: string[][] } }

export interface PageText {
  nav: string
  title: string
  description: string
  blocks: Block[]
}

export interface LegalText {
  heading: string
  draft: string
  updated: string
  materialNote: string
  placeholders: Record<Slot, string>
  pages: Record<LegalPage, PageText>
}

const ar: LegalText = {
  heading: 'الصفحات القانونية',
  draft:
    'مسودة قيد المراجعة: هذه الصفحات مبنية على القانون رقم 6 لسنة 2022 بشأن المعاملات الإلكترونية (فصل حماية البيانات الشخصية) والقانون رقم 5 لسنة 2022 بشأن مكافحة الجرائم الإلكترونية، ويراجعها محامٍ ليبي قبل اعتمادها. الخانات بين الأقواس تُستكمل قبل الاعتماد.',
  updated: 'آخر تحديث: {date} · النسخة {v}.',
  materialNote: 'نُعلن أي تغيير جوهري داخل التطبيق قبل سريانه، ونطلب موافقتك على النسخة الجديدة.',
  placeholders: {
    name: '[الاسم القانوني للجهة]',
    address: '[العنوان]',
    reg: '[رقم السجل]',
    courts: '[المحاكم المختصة]',
    fin: '[مدة السجلات المالية المطلوبة قانوناً]',
    shots: '[المدة]',
    wrong: '[المدة]',
    reply: '[المدة]',
    email: 'صفحة التواصل',
  },
  pages: {
    privacy: {
      nav: 'سياسة الخصوصية',
      title: 'سياسة الخصوصية',
      description: 'ما الذي تجمعه حفرة من بيانات، ولماذا، ومن يتلقاها، ومدة حفظها، وحقوقك.',
      blocks: [
        { h2: '1. من نحن' },
        { p: 'يدير خدمة «حفرة» {name}، {address}، ليبيا («نحن»). نحن المسؤولون عن البيانات التي تُجمع عبر التطبيق والموقع.' },
        { p: 'رقم السجل أو الترخيص: {reg}.', if: 'reg' },
        { h2: '2. موافقتك' },
        {
          p: 'لا نجمع بياناتك الشخصية ولا نعالجها إلا بعد موافقتك الصريحة عند إنشاء الحساب، ونُعلمك هنا بإجراءات حمايتها قبل أي معالجة. لا نستخدم بياناتك لغرض غير المذكور في هذه السياسة إلا بموافقة صريحة جديدة منك. يمكنك سحب موافقتك في أي وقت بحذف حسابك.',
        },
        { h2: '3. ما الذي نجمعه ولماذا' },
        {
          table: {
            id: 'collect',
            caption: 'البيانات التي نجمعها',
            head: ['البيانات', 'الغرض', 'مدة الحفظ'],
            rows: [
              ['الاسم والبريد وكلمة المرور (مشفّرة)', 'الحساب والتواصل معك بشأن بلاغاتك', 'حتى حذف الحساب'],
              ['صور البلاغ وموقعه ووصفه', 'نشر البلاغ ومتابعة إصلاحه', 'تبقى عامة دون ربطها بك بعد حذف الحساب'],
              ['مبلغ التبرع والرمز والتاريخ', 'المطابقة وسجل الشفافية', '{fin}'],
              ['صورة التحويل', 'التحقق من التبرع فقط', '{shots} بعد التأكيد أو الرفض'],
              ['رمز الإشعارات', 'إرسال تحديثات بلاغاتك', 'حتى تسجيل الخروج أو حذف الحساب'],
              ['سجلات تقنية وتقارير أعطال', 'الأمان وإصلاح الأعطال', '90 يوماً'],
            ],
          },
        },
        { p: 'لا نجمع بيانات بطاقتك أو رقم حسابك المصرفي، ولا نبيع أي بيانات، ولا نعرض الإعلانات القائمة على تتبعك.' },
        { h2: '4. الصور والموقع' },
        {
          p: 'نصغّر الصور على هاتفك ونحذف منها البيانات المخفية قبل الإرسال. صوّر الحفرة والطريق فقط: لا تصوّر وجوه الأشخاص أو لوحات السيارات أو داخل البيوت. يحق لنا إخفاء أو حذف أي جزء من صورة يكشف بيانات شخصية لغيرك. نستخدم موقعك فقط أثناء استخدام التطبيق.',
        },
        { h2: '5. مع من نشارك' },
        {
          p: 'يرى العامة صور البلاغ وموقعه وحالته فقط، دون اسمك. نشارك بيانات البلاغات مع الجهات المختصة بالإصلاح وشركائنا دون بيانات تعريفك. نكشف بيانات محددة للسلطات الليبية المختصة فقط بناءً على طلب قانوني مكتوب.',
        },
        { p: 'نستخدم مزودي الخدمات التقنية التالية، ولا يتلقى أي منهم إلا ما يلزم لعمله:' },
        {
          table: {
            id: 'services',
            caption: 'الخدمات التي تتلقى بيانات',
            head: ['الخدمة', 'ما تتلقاه', 'لماذا'],
            rows: [
              ['Cloudflare', 'بيانات الخدمة كلها: الحسابات والبلاغات والصور والتبرعات', 'الاستضافة وقاعدة البيانات وحفظ الصور'],
              ['Google Firebase (أندرويد فقط)', 'رمز الإشعارات، وتقارير الأعطال دون اسم أو بريد أو موقع', 'إرسال الإشعارات وإصلاح أعطال التطبيق'],
              ['OpenStreetMap', 'لا شيء عنك: نطلب صور الخريطة عبر خادمنا، فلا يصلها عنوان جهازك', 'خرائط التطبيق والموقع'],
            ],
          },
        },
        { h2: '6. حفظ البيانات خارج ليبيا' },
        {
          p: 'تُحفظ بيانات الخدمة على خوادم Cloudflare خارج ليبيا، وتمر تقارير الأعطال ورموز الإشعارات بخوادم Google. نختار مزودين يوفرون مستوى حماية مناسباً، منها التشفير أثناء النقل والحفظ وحصر الوصول بالمخوّلين. باستخدامك الخدمة توافق على هذا النقل.',
        },
        { h2: '7. حقوقك' },
        {
          ul: [
            'الاطلاع على بياناتك وتصديرها من التطبيق (حسابي ← تنزيل نسخة من بياناتي)، وتصحيحها وتحديثها.',
            'سحب موافقتك وحذف حسابك من التطبيق.',
            'رفض أي رسائل غير متعلقة ببلاغاتك؛ لن نرسل لك رسائل بعد رفضك.',
            'التواصل معنا لأي طلب: {email}. نرد خلال {reply}.',
          ],
        },
        { h2: '8. الأمان والقُصّر' },
        {
          p: 'نحمي البيانات بالتشفير وكلمات مرور مشفّرة وصلاحيات محدودة لكل مشرف وسجل لكل إجراء. إن حدث اختراق يمس بياناتك نُبلغك دون تأخير غير مبرر. الخدمة لمن بلغ 18 عاماً، أو بموافقة ولي الأمر لمن هم دون ذلك.',
        },
      ],
    },
    terms: {
      nav: 'شروط الاستخدام',
      title: 'شروط الاستخدام',
      description: 'شروط استخدام تطبيق حفرة وموقعها: طبيعة الخدمة، ومسؤوليتك عن البلاغ، وحدود مسؤوليتنا.',
      blocks: [
        {
          ol: [
            ['طبيعة الخدمة', '«حفرة» منصة لتوثيق الحفر ومتابعتها، وليست جهة حكومية. لا نضمن إصلاح أي حفرة ولا موعده؛ قرارات الإصلاح تعود للجهات المختصة والتمويل المتاح.'],
            ['حسابك', 'حساب واحد لكل شخص، وأنت مسؤول عن حفظ كلمة المرور. يحق لنا إيقاف الحساب الذي يخالف هذه الشروط.'],
            [
              'مسؤوليتك عن البلاغ',
              'تتعهد بأن بلاغك صحيح وأن الصور التقطتها أنت. يُمنع البلاغ الكاذب، والمحتوى المسيء، ونشر بيانات الآخرين. نحذف المخالف ونوقف الحساب، وقد نبلغ السلطات عن الأفعال المجرّمة قانوناً، ومنها ما يجرّمه القانون رقم 5 لسنة 2022.',
            ],
            ['ترخيص المحتوى', 'تمنحنا ترخيصاً مجانياً غير حصري لنشر صور البلاغ ووصفه وموقعه في التطبيق والموقع وتقارير الشفافية، ومشاركتها مع جهات الإصلاح.'],
            [
              'حدود المسؤولية',
              'تُقدَّم الخدمة «كما هي». لا نتحمل مسؤولية أي ضرر أو حادث مروري أو خسارة ناتجة عن حالة الطرق، أو عن الاعتماد على معلومات البلاغات، أو عن انقطاع الخدمة، في حدود ما يسمح به القانون الليبي.',
            ],
            ['سلامتك أولاً', 'لا تستخدم التطبيق أثناء القيادة، ولا تقف في الطريق لتصوير حفرة.'],
            ['تغيير الشروط', 'نُعلن أي تغيير جوهري داخل التطبيق قبل سريانه، ونطلب موافقتك عليه. إن لم توافق يمكنك حذف حسابك.'],
            ['القانون والاختصاص', 'تخضع هذه الشروط للقانون الليبي، وتختص محاكم {courts} بأي نزاع.'],
          ],
        },
      ],
    },
    'donation-rules': {
      nav: 'قواعد التبرع',
      title: 'قواعد التبرع',
      description: 'كيف تُستخدم التبرعات لإصلاح الحفر في حفرة، ومتى تُسترد، وما الذي ننشره بعد كل إصلاح.',
      blocks: [
        {
          ol: [
            ['تبرع طوعي لحفرة محددة', 'التبرع طوعي، ويُستخدم لإصلاح الحفرة المعلنة. لا يُحتسب إلا بعد مطابقته مع كشف الحساب.'],
            ['الفائض', 'ما يزيد عن التكلفة الفعلية، أو مال حملة أُلغيت، ينتقل إلى الحملة المفتوحة التالية، ويُعلن ذلك في صفحة الشفافية.'],
            ['الاسترداد', 'التبرع المؤكد غير قابل للاسترداد، إلا إذا ثبت تحويل خاطئ خلال {wrong} من التحويل.'],
            ['الحساب الصحيح', 'حوّل فقط إلى الحساب الظاهر داخل التطبيق. لسنا مسؤولين عن تحويل إلى حساب آخر أو أخطاء المصرف أو خدمة الدفع.'],
            ['الشفافية', 'ننشر التكلفة النهائية والإيصال بعد كل إصلاح.'],
          ],
        },
      ],
    },
    'delete-account': {
      nav: 'حذف الحساب',
      title: 'حذف الحساب',
      description: 'كيف تحذف حسابك في حفرة، وما الذي يُحذف وما الذي يبقى.',
      blocks: [
        { h2: 'من التطبيق' },
        { p: 'افتح «حسابي»، ثم اضغط «حذف حسابي» في أسفل الصفحة وأكّد. يمكنك قبل ذلك تنزيل نسخة من بياناتك من الصفحة نفسها.' },
        { h2: 'دون التطبيق' },
        { p: 'راسلنا من البريد المسجّل في حسابك على {email} واطلب حذف الحساب. نرد خلال {reply}.' },
        { h2: 'ما الذي يُحذف وما الذي يبقى' },
        {
          ul: [
            'نحذف فوراً اسمك وبريدك وكلمة المرور ورموز الإشعارات وإشعاراتك، ونُنهي جلساتك على كل الأجهزة.',
            'تبقى البلاغات العامة على الخريطة لأنها عن الطرق، دون أي صلة بك.',
            'نحتفظ بسجلات التبرع المالية للمدة التي يفرضها القانون فقط: {fin}. تُحذف صور التحويل بعد {shots} من تأكيدها أو رفضها.',
          ],
        },
      ],
    },
  },
}

const en: LegalText = {
  heading: 'Legal pages',
  draft:
    'Draft under review: these pages are written against Libyan Law No. 6 of 2022 on electronic transactions (its personal data chapter) and Law No. 5 of 2022 on combating cybercrime, and a Libyan lawyer reviews them before they take effect. The bracketed blanks are completed before then.',
  updated: 'Last updated: {date} · version {v}.',
  materialNote: 'We announce any material change in the app before it takes effect and ask you to accept the new version.',
  placeholders: {
    name: '[legal name of the operator]',
    address: '[address]',
    reg: '[registration number]',
    courts: '[competent courts]',
    fin: '[period financial records must be kept by law]',
    shots: '[period]',
    wrong: '[period]',
    reply: '[period]',
    email: 'our contact page',
  },
  pages: {
    privacy: {
      nav: 'Privacy policy',
      title: 'Privacy policy',
      description: 'What data HUFRA collects, why, who receives it, how long it is kept, and your rights.',
      blocks: [
        { h2: '1. Who we are' },
        { p: 'The HUFRA service is run by {name}, {address}, Libya (“we”). We are responsible for the data collected through the app and the website.' },
        { p: 'Registration or licence number: {reg}.', if: 'reg' },
        { h2: '2. Your consent' },
        {
          p: 'We collect and process your personal data only after your explicit consent when you create an account, and this page tells you how it is protected before any processing. We never use your data for a purpose not stated here without your new, explicit consent. You can withdraw your consent at any time by deleting your account.',
        },
        { h2: '3. What we collect and why' },
        {
          table: {
            id: 'collect',
            caption: 'The data we collect',
            head: ['Data', 'Purpose', 'Kept for'],
            rows: [
              ['Name, email and password (hashed)', 'Your account, and contacting you about your reports', 'Until you delete the account'],
              ['Report photos, location and description', 'Publishing the report and following its repair', 'Stay public, no longer linked to you, after you delete the account'],
              ['Donation amount, code and date', 'Matching transfers and the transparency record', '{fin}'],
              ['Transfer screenshot', 'Checking the donation only', '{shots} after it is confirmed or rejected'],
              ['Notification token', 'Sending updates on your reports', 'Until you sign out or delete the account'],
              ['Technical logs and crash reports', 'Security and fixing faults', '90 days'],
            ],
          },
        },
        { p: 'We never collect your card details or bank account number, we sell no data, and we show no advertising based on tracking you.' },
        { h2: '4. Photos and location' },
        {
          p: 'Your phone shrinks photos and removes their hidden data before sending. Photograph only the pothole and the road: no faces, number plates or the inside of homes. We may blur or remove any part of a photo that shows someone else’s personal data. We use your location only while you use the app.',
        },
        { h2: '5. Who we share with' },
        {
          p: 'The public sees a report’s photos, location and status only, never your name. We share report data with the authorities responsible for repairs and with our partners, without anything that identifies you. We disclose specific data to the competent Libyan authorities only on a written legal request.',
        },
        { p: 'We use these technical service providers, and each receives only what its job needs:' },
        {
          table: {
            id: 'services',
            caption: 'Services that receive data',
            head: ['Service', 'What it receives', 'Why'],
            rows: [
              ['Cloudflare', 'All service data: accounts, reports, photos and donations', 'Hosting, the database and photo storage'],
              ['Google Firebase (Android only)', 'Your notification token, and crash reports without a name, email or location', 'Sending notifications and fixing app crashes'],
              ['OpenStreetMap', 'Nothing about you: map images are fetched through our server, so your device’s address never reaches it', 'Maps in the app and on the website'],
            ],
          },
        },
        { h2: '6. Data kept outside Libya' },
        {
          p: 'Service data is kept on Cloudflare servers outside Libya, and crash reports and notification tokens pass through Google’s servers. We choose providers with an appropriate level of protection, including encryption in transit and at rest and access limited to authorised people. By using the service you agree to this transfer.',
        },
        { h2: '7. Your rights' },
        {
          ul: [
            'See and export your data from the app (My account → Download a copy of my data), and correct or update it.',
            'Withdraw your consent and delete your account from the app.',
            'Refuse any messages not about your reports; we send none after you refuse.',
            'Contact us with any request: {email}. We reply within {reply}.',
          ],
        },
        { h2: '8. Security and minors' },
        {
          p: 'We protect data with encryption, hashed passwords, limited rights for each administrator and a record of every action. If a breach affects your data we tell you without undue delay. The service is for people aged 18 or over, or under 18 with a parent’s or guardian’s consent.',
        },
      ],
    },
    terms: {
      nav: 'Terms of use',
      title: 'Terms of use',
      description: 'The terms for using the HUFRA app and website: what the service is, your responsibility for reports, and the limits of ours.',
      blocks: [
        {
          ol: [
            ['What the service is', 'HUFRA is a platform for recording and following potholes, not a government body. We do not guarantee that any pothole is repaired, or when; repairs are decided by the responsible authorities and the funding available.'],
            ['Your account', 'One account per person, and you keep your password safe. We may suspend an account that breaks these terms.'],
            [
              'Your responsibility for reports',
              'You confirm that your report is true and that you took the photos. False reports, offensive content and publishing other people’s data are not allowed. We remove what breaks these rules, suspend the account, and may report criminal acts to the authorities, including those under Law No. 5 of 2022.',
            ],
            ['Licence to your content', 'You give us a free, non-exclusive licence to publish a report’s photos, description and location in the app, on the website and in transparency reports, and to share them with those who repair roads.'],
            [
              'Limits of liability',
              'The service is provided “as is”. As far as Libyan law allows, we are not liable for any harm, traffic accident or loss caused by road conditions, by relying on report information, or by the service being unavailable.',
            ],
            ['Safety first', 'Do not use the app while driving, and do not stand in the road to photograph a pothole.'],
            ['Changes to these terms', 'We announce any material change in the app before it takes effect and ask you to accept it. If you do not accept, you can delete your account.'],
            ['Law and courts', 'These terms are governed by Libyan law, and the courts of {courts} decide any dispute.'],
          ],
        },
      ],
    },
    'donation-rules': {
      nav: 'Donation rules',
      title: 'Donation rules',
      description: 'How donations pay for pothole repairs on HUFRA, when they are refunded, and what we publish after each repair.',
      blocks: [
        {
          ol: [
            ['A voluntary gift for one pothole', 'Donating is voluntary, and the money repairs the pothole shown. A donation counts only once it is matched with the bank statement.'],
            ['Money left over', 'Anything above the real cost, or the money of a cancelled campaign, moves to the next open campaign, and the transparency page says so.'],
            ['Refunds', 'A confirmed donation is not refundable, unless a mistaken transfer is shown within {wrong} of the transfer.'],
            ['The right account', 'Transfer only to the account shown in the app. We are not responsible for transfers to another account, or for errors by the bank or the payment service.'],
            ['Transparency', 'We publish the final cost and the receipt after every repair.'],
          ],
        },
      ],
    },
    'delete-account': {
      nav: 'Delete your account',
      title: 'Delete your account',
      description: 'How to delete your HUFRA account, and what is deleted and what stays.',
      blocks: [
        { h2: 'In the app' },
        { p: 'Open “My account”, tap “Delete my account” at the bottom of the page, and confirm. Before that, you can download a copy of your data on the same page.' },
        { h2: 'Without the app' },
        { p: 'Write to us at {email} from the email address on your account and ask for it to be deleted. We reply within {reply}.' },
        { h2: 'What is deleted and what stays' },
        {
          ul: [
            'Your name, email, password, notification tokens and notifications are deleted at once, and you are signed out on every device.',
            'Public reports stay on the map because they are about roads, with no link to you.',
            'Financial donation records are kept only as long as the law requires: {fin}. Transfer screenshots are deleted {shots} after they are confirmed or rejected.',
          ],
        },
      ],
    },
  },
}

export const LEGAL: Record<Locale, LegalText> = { ar, en }

/** "90 days" / "٩٠ يوماً" with the right Arabic plural form. */
export function countText(locale: Locale, n: number, unit: 'day' | 'year'): string {
  if (locale === 'en') return `${n} ${unit}${n === 1 ? '' : 's'}`
  const forms = {
    day: { one: 'يوم واحد', two: 'يومان', few: 'أيام', many: 'يوماً', other: 'يوم' },
    year: { one: 'سنة واحدة', two: 'سنتان', few: 'سنوات', many: 'سنة', other: 'سنة' },
  }[unit]
  const rule = new Intl.PluralRules('ar').select(n) as keyof typeof forms | 'zero'
  if (rule === 'one' || rule === 'two') return forms[rule]
  return `${n} ${forms[rule === 'zero' ? 'other' : rule]}`
}
