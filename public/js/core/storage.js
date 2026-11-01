export async function openStorage() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("cho-em", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("data");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Hãy đóng tab cũ và tải lại ứng dụng."));
  });
  const write = (run) =>
    new Promise((resolve, reject) => {
      const transaction = db.transaction("data", "readwrite");
      run(transaction.objectStore("data"));
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () =>
        reject(transaction.error);
    });
  return {
    get: (key) =>
      new Promise((resolve, reject) => {
        const request = db.transaction("data").objectStore("data").get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
    set: (key, value) => write((store) => store.put(value, key)),
    removeAccount: (id) =>
      write((store) => {
        const request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          if (
            cursor.key === `account:${id}` ||
            String(cursor.key).startsWith(`backup:${id}:`)
          )
            cursor.delete();
          cursor.continue();
        };
      }),
  };
}
