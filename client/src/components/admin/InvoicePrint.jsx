import { api, moneyInWords } from '../../lib/utils';

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const formatMoney = (value, currency) => `${Number(value || 0).toLocaleString('ar-LB-u-nu-latn')} ${escapeHtml(currency || 'ل.ل')}`;
const formatMoneyWords = (value, currency) => escapeHtml(moneyInWords(value, currency || 'ل.ل'));
const formatDate = value => {
  const raw = String(value || '');
  const normalized = raw.endsWith('Z') || /[+-]\d\d:\d\d$/.test(raw) ? raw : `${raw}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ar-LB-u-nu-latn', { timeZone: 'Asia/Beirut', dateStyle: 'medium', timeStyle: 'short' });
};

export async function openInvoicePrint(orderId, printSize = 'A4') {
  const printWindow = window.open('', '_blank', 'width=900,height=1000');
  if (!printWindow) {
    alert('تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة للموقع.');
    return;
  }

  printWindow.opener = null;
  const normalizedPrintSize = ['A4','80mm','58mm'].includes(printSize) ? printSize : 'A4';
  const printClass = normalizedPrintSize === '58mm' ? 'thermal-58' : normalizedPrintSize === '80mm' ? 'thermal-80' : 'print-a4';
  printWindow.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>فاتورة الطلب #${escapeHtml(orderId)}</title><style>body{font-family:"Droid Arabic Kufi",Tahoma,Arial,sans-serif}</style></head><body><div style="padding:30px;text-align:center">جاري تجهيز الفاتورة…</div></body></html>`);
  printWindow.document.close();

  try {
    const invoice = await api(`/admin/orders/${orderId}/invoice`);
    const settings = invoice.settings || {};
    const customer = invoice.customer || {};
    const items = Array.isArray(invoice.items) ? invoice.items : [];
    const loyaltyAward = Number(invoice.loyalty_points_earned || 0);
    const couponCode = String(invoice.coupon_code || '').trim();
    const deliveryZoneName = String(invoice.delivery_zone_name || '').trim();

    const itemRows = items.map((item, index) => {
      const options = Array.isArray(item.options) && item.options.length ? `<div class="subline">الإضافات: ${item.options.map(escapeHtml).join('، ')}</div>` : '';
      return `<tr>
        <td class="num">${index + 1}</td>
        <td><strong>${escapeHtml(item.name)}</strong>${item.description ? `<div class="desc">${escapeHtml(item.description)}</div>` : ''}${options}</td>
        <td>${escapeHtml(item.category || '—')}</td>
        <td class="num">${Number(item.quantity || 0).toLocaleString('ar-LB-u-nu-latn')}</td>
        <td class="num">${formatMoney(item.price, settings.currency)}</td>
        <td class="num"><strong>${formatMoney(Number(item.price || 0) * Number(item.quantity || 0), settings.currency)}</strong></td>
      </tr>`;
    }).join('');

    const customerRows = [
      `<div><span>الاسم</span><b>${escapeHtml(customer.name || invoice.customer_name || '—')}</b></div>`,
      `<div><span>الهاتف</span><b dir="ltr">${escapeHtml(customer.phone || invoice.customer_phone || '—')}</b></div>`,
      customer.email ? `<div><span>البريد الإلكتروني</span><b dir="ltr">${escapeHtml(customer.email)}</b></div>` : '',
      `<div class="address"><span>العنوان</span><b>${escapeHtml(invoice.address || '—')}</b></div>`,
      deliveryZoneName ? `<div><span>منطقة التوصيل</span><b>${escapeHtml(deliveryZoneName)}</b></div>` : ''
    ].join('');

    const summaryRows = [
      invoice.delivery_fee != null && Number(invoice.delivery_fee) > 0 ? `<div><span>رسم التوصيل</span><strong>${formatMoney(invoice.delivery_fee, settings.currency)}</strong></div>` : '',
      `<div class="grand"><span>الإجمالي</span><strong>${formatMoney(invoice.total, settings.currency)}</strong></div>`,
      `<div class="words-total"><span>المجموع بالأحرف</span><strong>${formatMoneyWords(invoice.total, settings.currency)}</strong></div>`
    ].join('');

    const logo = settings.logoUrl ? `<img class="logo" src="${escapeHtml(settings.logoUrl)}" alt="شعار المطعم">` : `<div class="logo-fallback">ف</div>`;
    const loyaltyBlock = loyaltyAward > 0 ? `<div class="info-card loyalty"><span>نقاط الولاء المكتسبة</span><strong>${loyaltyAward.toLocaleString('ar-LB-u-nu-latn')} نقطة</strong></div>` : '';
    const couponBlock = couponCode ? `<div class="coupon-note">تم استعمال كوبون الخصم: <strong dir="ltr">${escapeHtml(couponCode)}</strong></div>` : '';

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>فاتورة الطلب #${escapeHtml(invoice.id)}</title>
<link rel="preconnect" href="https://db.onlinewebfonts.com">
<link rel="stylesheet" href="https://db.onlinewebfonts.com/c/7712e50ecac759e968ac145c0c4a6d33?family=Droid+Arabic+Kufi">
<link rel="stylesheet" href="https://db.onlinewebfonts.com/c/1b89eb34f74a02c0681727faadf48466?family=Droid+Arabic+Kufi+Bold">
<style>
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;color:#222;font-family:"Droid Arabic Kufi",Tahoma,Arial,sans-serif;font-size:12px;line-height:1.8}
body{padding:18mm}
.invoice{max-width:900px;margin:0 auto}
.header{display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:2px solid #222;padding-bottom:18px;margin-bottom:18px}
.brand{display:flex;align-items:center;gap:14px}.logo,.logo-fallback{width:68px;height:68px;object-fit:contain;border-radius:14px}.logo-fallback{display:flex;align-items:center;justify-content:center;background:#222;color:#fff;font-size:32px;font-weight:700}
.brand h1{font-size:22px;margin:0 0 3px}.brand p{margin:0;color:#666}.invoice-meta{text-align:left}.invoice-meta strong{display:block;font-size:17px}.invoice-meta span{color:#666}
.section-title{font-size:13px;font-weight:700;margin:20px 0 9px;padding-bottom:6px;border-bottom:1px solid #ddd}
.customer-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;border:1px solid #ddd;border-radius:10px;padding:12px}.customer-grid div{display:flex;gap:8px;align-items:flex-start}.customer-grid span{color:#777;min-width:92px}.customer-grid b{flex:1}.customer-grid .address{grid-column:1/-1}
table{width:100%;border-collapse:collapse;margin-top:4px}th,td{border-bottom:1px solid #ddd;padding:9px 7px;vertical-align:top}th{background:#f4f4f4;font-weight:700;text-align:right}td.num,th.num{text-align:center;white-space:nowrap}.desc,.subline{font-size:10px;color:#666;margin-top:2px}
.summary{margin-top:14px;margin-right:auto;width:min(360px,100%)}.summary div{display:flex;justify-content:space-between;padding:5px 0}.summary .grand{border-top:2px solid #222;margin-top:4px;padding-top:9px;font-size:15px}.summary .words-total{display:block;border-top:1px dashed #aaa;margin-top:6px;padding-top:7px}.summary .words-total span,.summary .words-total strong{display:block}.summary .words-total span{color:#666;font-size:10px}.summary .words-total strong{font-size:11px;margin-top:2px}
.info-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:15px}.info-card{border:1px solid #ddd;border-radius:10px;padding:9px 13px;display:flex;gap:12px;align-items:center}.info-card span{color:#666}.info-card.loyalty strong{font-size:14px}.coupon-note{margin-top:12px;padding:10px 12px;border:1px dashed #777;border-radius:9px}
.footer{margin-top:28px;padding-top:12px;border-top:1px solid #ddd;text-align:center;color:#777;font-size:10px}.print-actions{display:flex;justify-content:center;gap:8px;margin:20px 0}.print-actions button{font:inherit;border:0;border-radius:8px;padding:9px 18px;cursor:pointer;background:#222;color:#fff}.print-actions button.secondary{background:#eee;color:#222}
@media print{body{padding:0}.print-actions{display:none}.invoice{max-width:none}.header{break-inside:avoid}table{break-inside:auto}tr{break-inside:avoid;break-after:auto}}
@page{size:A4;margin:12mm}
@media print{
  body.thermal-80{padding:0;width:80mm;font-size:10px}
  body.thermal-58{padding:0;width:58mm;font-size:9px}
  body.thermal-80 .invoice{max-width:70mm;width:70mm}
  body.thermal-58 .invoice{max-width:50mm;width:50mm}
  body.thermal-80 .header,body.thermal-58 .header{gap:6px;padding-bottom:6px;margin-bottom:7px}
  body.thermal-80 .logo,body.thermal-80 .logo-fallback{width:42px;height:42px}
  body.thermal-58 .logo,body.thermal-58 .logo-fallback{width:34px;height:34px}
  body.thermal-80 .brand h1{font-size:15px} body.thermal-58 .brand h1{font-size:13px}
  body.thermal-80 .brand p,body.thermal-58 .brand p{font-size:7px}
  body.thermal-80 .invoice-meta{font-size:7px} body.thermal-58 .invoice-meta{font-size:6px}
  body.thermal-80 .invoice-meta strong{font-size:9px} body.thermal-58 .invoice-meta strong{font-size:8px}
  body.thermal-80 .section-title,body.thermal-58 .section-title{font-size:9px;margin:8px 0 4px;padding-bottom:2px}
  body.thermal-80 .customer-grid,body.thermal-58 .customer-grid{display:block;border:0;padding:0}
  body.thermal-80 .customer-grid div,body.thermal-58 .customer-grid div{display:flex;margin-bottom:2px}
  body.thermal-80 .customer-grid span,body.thermal-58 .customer-grid span{min-width:50px}
  body.thermal-80 th,body.thermal-80 td{padding:4px 2px;font-size:8px}
  body.thermal-58 th,body.thermal-58 td{padding:3px 1px;font-size:7px}
  body.thermal-80 .desc,body.thermal-80 .subline{font-size:7px} body.thermal-58 .desc,body.thermal-58 .subline{font-size:6px}
  body.thermal-80 .summary,body.thermal-58 .summary{width:100%;font-size:9px}
  body.thermal-80 .summary .grand{font-size:12px} body.thermal-58 .summary .grand{font-size:11px}
  body.thermal-80 .info-card,body.thermal-58 .info-card{border:0;padding:2px 0}
  body.thermal-80 .footer,body.thermal-58 .footer{font-size:7px;margin-top:10px;padding-top:4px}
}
@page thermal80{size:80mm auto;margin:0} @page thermal58{size:58mm auto;margin:0}
body.thermal-80{page:thermal80} body.thermal-58{page:thermal58}
</style>
</head>
<body class="${printClass}">
<div class="invoice">
  <header class="header">
    <div class="brand">${logo}<div><h1>${escapeHtml(settings.siteName || 'فرنية صاج')}</h1><p>فاتورة طلب</p></div></div>
    <div class="invoice-meta"><strong>فاتورة #${escapeHtml(invoice.id)}</strong><span>${formatDate(invoice.created_at)}</span></div>
  </header>

  <div class="section-title">بيانات الزبون</div>
  <div class="customer-grid">${customerRows}</div>

  <div class="section-title">تفاصيل الطلب</div>
  <table>
    <thead><tr><th class="num">#</th><th>الصنف والشرح</th><th>المجموعة</th><th class="num">الكمية</th><th class="num">السعر</th><th class="num">الإجمالي</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div class="summary">${summaryRows}</div>

  ${loyaltyBlock || couponBlock ? `<div class="info-row">${loyaltyBlock}${couponBlock}</div>` : ''}
  ${invoice.notes ? `<div class="section-title">ملاحظات الطلب</div><div class="customer-grid"><div class="address"><span>ملاحظة</span><b>${escapeHtml(invoice.notes)}</b></div></div>` : ''}
  <footer class="footer">${escapeHtml(settings.siteName || 'فرنية صاج')} · شكراً لطلبكم</footer>
  <div class="print-actions"><button onclick="window.print()">طباعة الفاتورة</button><button class="secondary" onclick="window.close()">إغلاق</button></div>
</div>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350));</script>
</body></html>`);
    printWindow.document.close();
  } catch (error) {
    printWindow.document.open();
    printWindow.document.write(`<html lang="ar" dir="rtl"><body style="font-family:Tahoma,Arial,sans-serif;padding:40px;text-align:center"><h2>تعذر تجهيز الفاتورة</h2><p>${escapeHtml(error.message || 'حدث خطأ غير متوقع')}</p><button onclick="window.close()">إغلاق</button></body></html>`);
    printWindow.document.close();
  }
}
