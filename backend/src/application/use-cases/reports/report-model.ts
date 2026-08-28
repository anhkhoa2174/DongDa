// Dựng nội dung báo cáo theo từng loại (F10.2–F10.8) từ dữ liệu tổng hợp.
// Layer: Application (thuần, không phụ thuộc framework) — dùng cho cả preview lẫn xuất Excel.

export interface ReportSheet {
  name: string;
  aoa: (string | number)[][]; // array-of-arrays: dòng đầu là tiêu đề cột
}

export interface ReportModel {
  title: string;
  sheets: ReportSheet[];
}

const REPORT_TITLES: Record<string, string> = {
  fund: 'Báo cáo Quỹ',
  wu: 'Báo cáo Western Union',
  mg: 'Báo cáo MoneyGram',
  fx: 'Báo cáo Mua/Bán ngoại tệ',
  transfer: 'Báo cáo Điều động vốn',
  gap: 'Báo cáo Sai lệch',
  debt: 'Báo cáo Công nợ',
  bank: 'Báo cáo Ngân hàng',
};

export function reportTitle(reportType: string): string {
  return REPORT_TITLES[reportType] ?? `Báo cáo ${reportType.toUpperCase()}`;
}

// data = kết quả GetSummaryUseCase.execute()
export function buildReportModel(
  reportType: string,
  data: any,
  meta: { branchId?: string; dateFrom?: string; dateTo?: string; generatedAt: string },
): ReportModel {
  const title = reportTitle(reportType);
  const infoSheet: ReportSheet = {
    name: 'Thông tin',
    aoa: [
      ['Loại báo cáo', title],
      ['Chi nhánh', meta.branchId ?? 'Toàn hệ thống'],
      ['Từ ngày', meta.dateFrom ?? '—'],
      ['Đến ngày', meta.dateTo ?? '—'],
      ['Thời điểm xuất', meta.generatedAt],
    ],
  };

  const sheets: ReportSheet[] = [];
  switch (reportType) {
    // Updated: Báo cáo Vốn và Quỹ
    case 'fund':
      sheets.push({
        name: 'Tiền mặt',
        aoa: [['Loại tiền', 'Số dư'], ['VND', data.cash?.vnd ?? 0], ['USD', data.cash?.usd ?? 0]],
      });
      sheets.push({
        name: 'Quỹ A (ngoại tệ)',
        aoa: [['Loại tiền', 'Số dư'], ...(data.fundA ?? []).map((f: any) => [f.currency, f.balance])],
      });
      break;
    // Updated: Báo cáo theo dõi chi trả Western Union / thu chi MoneyGram
    case 'wu':
    case 'mg': {
      const s = data.transactions?.[reportType] ?? {};
      sheets.push({
        name: reportType.toUpperCase(),
        aoa: [
          ['Chỉ tiêu', 'Giá trị'],
          ['Số giao dịch', s.count ?? 0],
          ['Tổng USD', s.totalUsd ?? 0],
          ['Tổng VND', s.totalVnd ?? 0],
          ['Lợi nhuận (VND)', s.profit ?? 0],
        ],
      });
      break;
    }
    // Updated: Báo cáo Ngoại tệ
    case 'fx': {
      const s = data.transactions?.fx ?? {};
      sheets.push({
        name: 'Ngoại tệ',
        aoa: [
          ['Chỉ tiêu', 'Giá trị'],
          ['Số GD mua', s.buyCount ?? 0],
          ['Số GD bán', s.sellCount ?? 0],
          ['Giá trị mua (VND)', s.buyVnd ?? 0],
          ['Giá trị bán (VND)', s.sellVnd ?? 0],
        ],
      });
      break;
    }
    // Updated: Báo cáo Công nợ (WU/MG chờ thanh toán từ Ngân hàng)
    case 'debt':
      sheets.push({
        name: 'Công nợ',
        aoa: [
          ['Đối tác', 'Loại tiền', 'Còn lại', 'Trạng thái'],
          ...(data.debt?.items ?? []).map((d: any) => [d.provider, d.currency, d.outstanding, d.status]),
        ],
      });
      sheets.push({
        name: 'Tổng hợp',
        aoa: [
          ['Chỉ tiêu', 'Giá trị'],
          ['WU còn phải thu (USD)', data.debt?.wuOutstandingUsd ?? 0],
          ['MG còn phải thu (USD)', data.debt?.mgOutstandingUsd ?? 0],
        ],
      });
      break;
    // Updated: Báo cáo Ngân hàng (sao kê, tồn đầu/cuối theo tài khoản)
    case 'bank':
      sheets.push({
        name: 'Tài khoản ngân hàng',
        aoa: [
          ['Ngân hàng', 'Loại tiền', 'Số dư'],
          ...(data.bank?.accounts ?? []).map((b: any) => [b.bankCode, b.currency, b.balance]),
          [],
          ['Tổng VND', '', data.bank?.totalVnd ?? 0],
          ['Tổng USD', '', data.bank?.totalUsd ?? 0],
        ],
      });
      break;
    // Updated: Báo cáo Sai lệch và Rủi ro
    case 'gap':
      sheets.push({
        name: 'Sai lệch / Cảnh báo',
        aoa: [
          ['Loại', 'Mức độ', 'Nội dung'],
          ...(data.alerts ?? []).map((a: any) => [a.type, a.level, a.message]),
        ],
      });
      break;
    // Updated: Báo cáo Điều động Vốn (lịch sử luân chuyển vốn)
    case 'transfer':
      sheets.push({
        name: 'Điều động vốn',
        aoa: [
          ['Ghi chú'],
          ['Báo cáo điều động vốn chi tiết chưa có trong bản tổng hợp — sẽ bổ sung theo F10.6.'],
        ],
      });
      break;
    default:
      sheets.push({ name: 'Dữ liệu', aoa: [['Không có dữ liệu cho loại báo cáo này']] });
  }

  return { title, sheets: [infoSheet, ...sheets] };
}
