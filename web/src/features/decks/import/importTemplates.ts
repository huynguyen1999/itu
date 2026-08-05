import * as XLSX from 'xlsx';

const templateRows: Array<[string, string, string, boolean]> = [
  ['What is the capital of Japan?', 'Tokyo', '2026-07-20T12:00:00Z', false],
  ['What is the atomic number of Oxygen?', '8', '', true],
  ["Translate to French: 'Thank you'", 'Merci', '2026-07-15T18:30:00Z', false],
];

export function downloadCsvTemplate() {
  const csvContent = [
    'question,answer,nextReviewDate,generateReverse',
    ...templateRows.map((row) => row.join(',')),
  ].join('\n');
  downloadTextFile('itu_import_template.csv', csvContent, 'text/csv;charset=utf-8;');
}

export function downloadJsonTemplate() {
  const jsonContent = JSON.stringify(
    templateRows.map(([question, answer, nextReviewDate, generateReverse]) => ({
      question,
      answer,
      ...(nextReviewDate ? { nextReviewDate } : {}),
      generateReverse,
    })),
    null,
    2,
  );
  downloadTextFile('itu_import_template.json', jsonContent, 'application/json;charset=utf-8;');
}

export function downloadExcelTemplate() {
  const headers = [['question', 'answer', 'nextReviewDate', 'generateReverse']];
  const worksheet = XLSX.utils.aoa_to_sheet([...headers, ...templateRows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
  XLSX.writeFile(workbook, 'itu_import_template.xlsx');
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
