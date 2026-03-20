import { vi, describe, it, expect, afterEach } from "vitest";
import { EventEmitter } from "events";

const mockFd = {
  read: vi.fn(),
  close: vi.fn(),
};

const mockProc = {
  stdout: new EventEmitter(),
  stderr: new EventEmitter(),
  kill: vi.fn(),
  on: vi.fn(),
};

vi.mock("child_process", () => ({
  spawn: vi.fn(() => mockProc),
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    promises: {
      open: vi.fn(async () => {
        return mockFd;
      }),
      access: vi.fn(async (path: string, _mode?: number) => {
        console.log(path);
        const toErrorPath = [
          "/Applications/LibreOffice.app/Contents/MacOS/soffice",
          "/Applications/LibreOffice.app/Contents/MacOS/libreoffice",
          "C:\\Program Files\\Libreoffice\\program\\soffice.exe",
          "./test_fail.pdf",
          "test_fail.pdf",
          "test.docx",
        ];
        if (toErrorPath.includes(path)) {
          throw new Error("unaccessible");
        }
        return;
      }),
      mkdtemp: vi.fn(async () => {
        return "/tmp/test";
      }),
      readFile: vi.fn(async () => {
        return "hello world";
      }),
    },
  };
});

import {
  guessFileExtension,
  guessExtensionFromBuffer,
  findImageMagickCommand,
  findLibreOfficeCommand,
  convertOfficeDocument,
  convertImageToPdf,
  convertToPdf,
  getTmpDir,
} from "./convertToPdf";

describe("test guessFileExtension", () => {
  it("detects PDF", async () => {
    mockFd.read.mockImplementation((buffer: Buffer) => {
      Buffer.from("%PDF").copy(buffer);
    });

    expect(await guessFileExtension("/some/file")).toBe(".pdf");
  });

  it("detects PNG", async () => {
    mockFd.read.mockImplementation((buffer: Buffer) => {
      Buffer.from([0x89, 0x50, 0x4e, 0x47]).copy(buffer);
    });

    expect(await guessFileExtension("/some/file")).toBe(".png");
  });

  it("returns extension directly if present", async () => {
    expect(await guessFileExtension("/some/file.pdf")).toBe(".pdf");
  });
});

describe("test command availability", () => {
  it("libreoffice available", async () => {
    mockProc.on.mockImplementation((event, cb) => {
      if (event === "close") cb(0);
    });
    mockProc.stdout.emit("data", "/opt/bin/libreoffice");
    const result = await findLibreOfficeCommand();
    expect(result).toBe("libreoffice");
  });

  it("libreoffice not available", async () => {
    mockProc.on.mockImplementation((event, cb) => {
      if (event === "close") cb(1);
    });
    mockProc.stderr.emit("data", "command not found");
    // does not throw
    const result = await findLibreOfficeCommand();
    expect(result).toBeNull();
  });

  it("imagemagick available", async () => {
    mockProc.on.mockImplementation((event, cb) => {
      if (event === "close") cb(0);
    });
    mockProc.stdout.emit("data", "/opt/bin/libreoffice");
    const result = await findImageMagickCommand();
    expect(result).toStrictEqual({ command: "magick", args: [] });
  });

  it("imagemagick not available", async () => {
    mockProc.on.mockImplementation((event, cb) => {
      if (event === "close") cb(1);
    });
    mockProc.stderr.emit("data", "command not found");
    // does not throw
    const result = await findImageMagickCommand();
    expect(result).toBeNull();
  });
});

describe("test convertOfficeDocument", () => {
  it("conversion succeeds", async () => {
    mockProc.on.mockImplementation((event, cb) => {
      if (event === "close") cb(0);
    });
    mockProc.stdout.emit("data", "conversion successfull");

    const result = await convertOfficeDocument("test.docx", "./");
    expect(result).toBe("test.pdf");
  });

  it("conversion fails (command not found)", async () => {
    mockProc.on.mockImplementation((event, cb) => {
      if (event === "close") cb(1);
    });
    mockProc.stdout.emit("data", "command not found");

    await expect(convertOfficeDocument("test_command.docx", "./")).rejects.toThrow(
      "LibreOffice is not installed. Please install LibreOffice to convert office documents. On macOS: brew install --cask libreoffice, On Ubuntu: apt-get install libreoffice"
    );
  });

  it("conversion fails (output not found)", async () => {
    mockProc.on.mockImplementation((event, cb) => {
      if (event === "close") cb(0);
    });
    mockProc.stdout.emit("data", "conversion successfull");

    await expect(convertOfficeDocument("test_fail.docx", "./")).rejects.toThrow(
      "LibreOffice conversion succeeded but output PDF not found"
    );
  });
});

describe("test convertImageToPdf", () => {
  it("conversion succeeds", async () => {
    mockProc.on.mockImplementation((event, cb) => {
      if (event === "close") cb(0);
    });
    mockProc.stdout.emit("data", "conversion successfull");

    const result = await convertImageToPdf("test.png", "./");
    expect(result).toBe("test.pdf");
  });

  it("conversion fails (command not found)", async () => {
    mockProc.on.mockImplementation((event, cb) => {
      if (event === "close") cb(1);
    });
    mockProc.stdout.emit("data", "command not found");

    await expect(convertImageToPdf("test_command.png", "./")).rejects.toThrow(
      "ImageMagick is not installed. Please install ImageMagick to convert images. On macOS: brew install imagemagick, On Ubuntu: apt-get install imagemagick"
    );
  });
});

describe("test convertToPdf", () => {
  it("convert PDF fails because file not found", async () => {
    const result = await convertToPdf("test.docx");
    expect(result).toStrictEqual({
      message: `File not found: test.docx`,
      code: "FILE_NOT_FOUND",
    });
  });

  it("convert an office document (word)", async () => {
    mockProc.on.mockImplementation((event, cb) => {
      if (event === "close") cb(0);
    });
    mockProc.stdout.emit("data", "conversion successfull");
    const result = await convertToPdf("test_1.docx");
    expect(result).toStrictEqual({
      pdfPath: "/tmp/test/test_1.pdf",
      originalExtension: ".docx",
    });
  });

  it("convert an office document (xlsx)", async () => {
    mockProc.on.mockImplementation((event, cb) => {
      if (event === "close") cb(0);
    });
    mockProc.stdout.emit("data", "conversion successfull");
    const result = await convertToPdf("test.xlsx");
    expect(result).toStrictEqual({
      pdfPath: "/tmp/test/test.pdf",
      originalExtension: ".xlsx",
    });
  });

  it("convert an image", async () => {
    mockProc.on.mockImplementation((event, cb) => {
      if (event === "close") cb(0);
    });
    mockProc.stdout.emit("data", "conversion successfull");
    const result = await convertToPdf("test.png");
    expect(result).toStrictEqual({
      pdfPath: "/tmp/test/test.pdf",
      originalExtension: ".png",
    });
  });

  it("convert a text file", async () => {
    mockProc.on.mockImplementation((event, cb) => {
      if (event === "close") cb(0);
    });
    mockProc.stdout.emit("data", "conversion successfull");
    const result = await convertToPdf("test.txt");
    expect(result).toStrictEqual({
      content: "hello world",
    });
  });
});

describe("test guessExtensionFromBuffer", () => {
  it("detects PDF from magic bytes", () => {
    const pdfBytes = Buffer.from("%PDF-1.4 some content");
    expect(guessExtensionFromBuffer(pdfBytes)).toBe(".pdf");
  });

  it("detects PNG from magic bytes", () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(guessExtensionFromBuffer(pngBytes)).toBe(".png");
  });

  it("detects JPEG from magic bytes", () => {
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(guessExtensionFromBuffer(jpegBytes)).toBe(".jpg");
  });

  it("detects TIFF (little-endian) from magic bytes", () => {
    const tiffBytes = Buffer.from([0x49, 0x49, 0x2a, 0x00]);
    expect(guessExtensionFromBuffer(tiffBytes)).toBe(".tiff");
  });

  it("detects TIFF (big-endian) from magic bytes", () => {
    const tiffBytes = Buffer.from([0x4d, 0x4d, 0x00, 0x2a]);
    expect(guessExtensionFromBuffer(tiffBytes)).toBe(".tiff");
  });

  it("detects ZIP-based formats from magic bytes", () => {
    const zipBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    expect(guessExtensionFromBuffer(zipBytes)).toBe(".docx");
  });

  it("defaults to .pdf for unknown bytes", () => {
    const unknownBytes = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    expect(guessExtensionFromBuffer(unknownBytes)).toBe(".pdf");
  });

  it("works with Uint8Array input", () => {
    const pdfBytes = new Uint8Array(Buffer.from("%PDF-1.7"));
    expect(guessExtensionFromBuffer(pdfBytes)).toBe(".pdf");
  });
});

describe("test getTmpDir", () => {
  const originalEnv = process.env.LITEPARSE_TMPDIR;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.LITEPARSE_TMPDIR;
    } else {
      process.env.LITEPARSE_TMPDIR = originalEnv;
    }
  });

  it("returns LITEPARSE_TMPDIR when set", () => {
    process.env.LITEPARSE_TMPDIR = "/custom/tmp";
    expect(getTmpDir()).toBe("/custom/tmp");
  });

  it("falls back to os.tmpdir() when LITEPARSE_TMPDIR is not set", () => {
    delete process.env.LITEPARSE_TMPDIR;
    const os = require("os");
    expect(getTmpDir()).toBe(os.tmpdir());
  });
});
