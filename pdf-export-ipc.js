import { app, BrowserWindow, dialog, ipcMain } from "electron";
import fs from "fs/promises";
import path from "path";

const IEEE_FOOTER_TEMPLATE = `
  <div style="width:100%;padding:0 6mm;box-sizing:border-box;line-height:1;">
    <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:baseline;font-family:'Times New Roman',Times,serif;color:#111111;">
      <div></div>
      <div style="font-size:10pt;text-align:center;"><span class="pageNumber"></span></div>
      <div style="justify-self:end;white-space:nowrap;font-size:8pt;color:#111111;">
        Made by <a href="https://github.com/p2plabsxyz/p2pmd" style="color:#111111;text-decoration:none;">p2pmd</a>
      </div>
    </div>
  </div>
`;

function buildPrintOptions(html) {
  const printOptions = {
    printBackground: true,
    preferCSSPageSize: true
  };

  const isIeeePaper = typeof html === "string" && /class=["'][^"']*\bieee-paper\b/.test(html);
  if (!isIeeePaper) {
    return printOptions;
  }

  printOptions.preferCSSPageSize = false;
  printOptions.pageSize = "A4";
  printOptions.margins = {
    top: 0.75,
    bottom: 0.85,
    left: 0.625,
    right: 0.625
  };
  printOptions.displayHeaderFooter = true;
  printOptions.headerTemplate = '<div style="font-size:0;line-height:0;width:100%;"></div>';
  printOptions.footerTemplate = IEEE_FOOTER_TEMPLATE;
  return printOptions;
}

export function setupP2pmdPdfExportIpc() {
  ipcMain.handle("p2pmd-print-to-pdf", async (event, { html, fileName } = {}) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const safeName = typeof fileName === "string" && fileName.trim() ? fileName : "p2pmd-document.pdf";
    const { canceled, filePath } = await dialog.showSaveDialog(parentWindow, {
      defaultPath: path.join(app.getPath("downloads"), safeName),
      filters: [{ name: "PDF", extensions: ["pdf"] }]
    });
    if (canceled || !filePath) {
      return { canceled: true };
    }

    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: false,
        contextIsolation: true
      }
    });

    try {
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html || "")}`;
      await printWindow.loadURL(dataUrl);
      const printOptions = buildPrintOptions(html);
      const pdfBuffer = await printWindow.webContents.printToPDF(printOptions);
      await fs.writeFile(filePath, pdfBuffer);
      return { canceled: false, filePath };
    } finally {
      if (!printWindow.isDestroyed()) {
        printWindow.close();
      }
    }
  });
}
