/**
 * Turns the fixed 816×1056 printed pages (`.sp`) inside `root` into a
 * letter-size PDF. Shared by the Loan Options Worksheet and the VA buyer
 * guide. The libraries load only when a button is pressed.
 */
export async function buildSheetPdf(root: HTMLElement): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  await Promise.all(['300 12px LwRoboto', '400 12px LwRoboto', '500 12px LwRoboto', 'italic 500 12px LwCorm']
    .map((f) => document.fonts.load(f).catch(() => null)))
  await document.fonts.ready
  const pages = Array.from(root.querySelectorAll<HTMLElement>('.sp'))
  const pdf = new jsPDF({ unit: 'pt', format: 'letter', compress: true })
  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true })
    if (i) pdf.addPage('letter')
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 612, 792)
  }
  return pdf.output('blob')
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
