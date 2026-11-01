import { renderLayout } from './layout'

export function renderTrustPage(): string {
  const body = `
<div class="container page-narrow">
  <h1 class="page-title" data-i18n="trust_page_title">الأمان والخصوصية</h1>

  <div class="card mb-4">
    <h2 class="card-title" data-i18n="trust_who_title">من نحن</h2>
    <p class="text-secondary" data-i18n="trust_who_desc">حفرة هي مبادرة مجتمعية مستقلة وغير ربحية لرصد حفريات الطرق في طرابلس الكبرى. المنصة ليست جهة رسمية أو شركة مسجلة، وهي لا تنفذ أعمال الإصلاح بنفسها، بل توفر أداة شفافة لتوثيق البلاغات ومتابعة حالتها.</p>
  </div>

  <div class="card mb-4">
    <h2 class="card-title" data-i18n="trust_data_title">كيف نحمي بياناتك</h2>
    <ul class="plain-list">
      <li data-i18n="trust_data_1">التبليغ متاح دون الحاجة لإنشاء حساب.</li>
      <li data-i18n="trust_data_2">التسجيل الاختياري يتطلب بريداً إلكترونياً وكلمة مرور فقط.</li>
      <li data-i18n="trust_data_3">الصور تُخزّن في تخزين سحابي مخصص وليس في قاعدة البيانات مباشرة، ويتم ضغطها في متصفحك قبل الرفع.</li>
      <li data-i18n="trust_data_4">يمكنك في أي وقت تصدير بياناتك أو طلب حذف حسابك من صفحة "حسابي".</li>
      <li data-i18n="trust_data_5">جميع الاتصالات مشفّرة عبر HTTPS.</li>
      <li data-i18n="trust_data_6">كل إجراء إداري مسجّل في سجل تدقيق ثابت لا يمكن تعديله أو حذفه.</li>
    </ul>
  </div>

  <div class="card mb-4">
    <h2 class="card-title" data-i18n="trust_abuse_title">حماية من سوء الاستخدام</h2>
    <p class="text-secondary" data-i18n="trust_abuse_desc">يوجد حد لعدد البلاغات والصور المرفوعة من كل عنوان اتصال وحساب خلال فترة زمنية معينة للحد من البلاغات المزيفة أو المتكررة، مع مراجعة يدوية للبلاغات المتشابهة جغرافياً.</p>
  </div>

  <div class="card">
    <h2 class="card-title" data-i18n="trust_contact_title">تواصل معنا</h2>
    <p class="text-secondary" data-i18n="trust_contact_desc">لأي استفسار يتعلق بالخصوصية أو الأمان، يمكنك التواصل معنا عبر قناة واتساب الإدارة الظاهرة في أسفل الصفحة إن كانت متوفرة.</p>
  </div>
</div>
`

  return renderLayout(body, {
    title: 'الأمان والخصوصية',
    activeNav: 'trust',
  })
}
