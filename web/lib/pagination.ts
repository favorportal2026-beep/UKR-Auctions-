/** Читаємо послідовними сторінками, враховуючи серверний ліміт REST API. */
export async function readAllRows<T>(page: (from: number, to: number) => PromiseLike<{
  data: unknown[] | null; error: { message: string } | null; count?: number | null;
}>): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const {data,error,count} = await page(from,from+499);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    from += batch.length;
    if (!batch.length || (count != null && from>=count)) break;
  }
  return rows;
}
