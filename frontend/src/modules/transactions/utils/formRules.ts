export const positiveNumberRule = (label: string) => ({
  validator: (_: unknown, value: unknown) => {
    const numberValue = Number(value);
    if (value === undefined || value === null || value === '' || !Number.isFinite(numberValue)) {
      return Promise.reject(new Error(`Vui lòng nhập ${label.toLowerCase()} hợp lệ`));
    }
    if (numberValue <= 0) return Promise.reject(new Error(`${label} phải lớn hơn 0`));
    return Promise.resolve();
  },
});
