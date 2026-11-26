export async function waitForReviewClose(page) {
  await new Promise((resolve) => {
    let timer;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      process.removeListener("SIGINT", finish);
      process.removeListener("SIGTERM", finish);
      resolve();
    };
    process.once("SIGINT", finish);
    process.once("SIGTERM", finish);
    const check = async () => {
      if (finished) return;
      try {
        
        if (typeof page.isClosed === "function") {
          if (page.isClosed()) { finish(); return; }
        } else await page.url();
      } catch { finish(); return; }
      if (!finished) timer = setTimeout(check, 500);
    };
    void check();
  });
}
