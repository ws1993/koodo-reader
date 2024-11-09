import BookModel from "../../models/Book";
declare var window: any;
export const changePath = (oldPath: string, newPath: string) => {
  return new Promise<number>((resolve, reject) => {
    const fs = window.require("fs-extra");
    try {
      fs.readdir(newPath, (err, files: string[]) => {
        let isConfiged: boolean = false;
        files.forEach((file: string) => {
          if (file === "config.zip") {
            isConfiged = true;
          }
        });
        if (isConfiged) {
          localStorage.setItem("storageLocation", newPath);
          resolve(1);
        } else {
          fs.copy(oldPath, newPath, function (err) {
            if (err) return;
            fs.emptyDirSync(oldPath);
            resolve(2);
          });
        }
      });
    } catch (error) {
      console.log(error);
      resolve(0);
    }
  });
};
export const syncData = (blob: Blob, books: BookModel[] = [], isSync: true) => {
  return new Promise<boolean>((resolve, reject) => {
    let file = new File([blob], "config.zip", {
      lastModified: new Date().getTime(),
      type: blob.type,
    });
    const fs = window.require("fs");
    const path = window.require("path");
    const AdmZip = window.require("adm-zip");
    const dataPath = localStorage.getItem("storageLocation")
      ? localStorage.getItem("storageLocation")
      : window
          .require("electron")
          .ipcRenderer.sendSync("storage-location", "ping");
    var reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = async (event) => {
      if (!event.target) return;
      if (!fs.existsSync(path.join(dataPath))) {
        fs.mkdirSync(path.join(dataPath));
      }
      fs.writeFileSync(
        path.join(dataPath, file.name),
        Buffer.from(event.target.result as any)
      );
      var zip = new AdmZip(path.join(dataPath, file.name));
      zip.extractAllTo(/*target path*/ dataPath, /*overwrite*/ true);

      if (!isSync) {
        let deleteBooks = books.map((item) => {
          return window.localforage.removeItem(item.key);
        });
        await Promise.all(deleteBooks);
        resolve(true);
      } else {
        resolve(true);
      }
    };
  });
};

export const zipFilesToBlob = (buffers: ArrayBuffer[], names: string[]) => {
  var zip = new window.JSZip();
  for (let index = 0; index < buffers.length; index++) {
    zip.file(names[index], buffers[index]);
  }
  return zip.generateAsync({ type: "blob" });
};

export const base64ToArrayBufferAndExtension = (base64: string) => {
  let mimeMatch = base64.match(/^data:(image\/\w+);base64,/);
  if (!mimeMatch) {
    let fileType = base64ToFileType(base64);
    if (!fileType) {
      throw new Error("Invalid base64 string");
    }
    mimeMatch = ["", `image/${fileType}`];
  }
  const mime = mimeMatch[1];

  const extension = mime.split("/")[1];

  const base64Data = base64.replace(/^data:.*;base64,/, "");

  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const arrayBuffer = bytes.buffer;

  return {
    arrayBuffer,
    extension,
  };
};
function base64ToFileType(base64: string) {
  // Decode base64 string to binary string
  base64 = base64.replace(/^data:.*;base64,/, "");
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Determine file type based on magic numbers
  const header = bytes.subarray(0, 4);
  let fileType = "unknown";
  const signatures: { [key: string]: string } = {
    "89504e47": "png",
    ffd8ffe0: "jpg",
    ffd8ffe1: "jpg",
    ffd8ffdb: "jpg",
    ffd8ffe2: "jpg",
    "47494638": "gif",
    "424d": "bmp",
    "49492a00": "tiff",
    "4d4d002a": "tiff",
    "52494646": "webp", // 'RIFF' followed by 'WEBP'
    "377abcaf271c": "webp", // WebP extended signature
    "3c3f786d6c": "svg",
    "00000100": "ico",
  };

  const headerHex = Array.from(header)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (signatures[headerHex]) {
    fileType = signatures[headerHex];
  }

  return fileType;
}
export function getParamsFromUrl() {
  var hashParams: any = {};
  var e,
    r = /([^&;=]+)=?([^&;]*)/g,
    q =
      window.location.hash.substring(2) ||
      window.location.search.substring(1).split("#")[0];

  while ((e = r.exec(q))) {
    hashParams[e[1]] = decodeURIComponent(e[2]);
  }
  return hashParams;
}
export const toArrayBuffer = (buf) => {
  const ab = new ArrayBuffer(buf.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < buf.length; ++i) {
    view[i] = buf[i];
  }
  return ab;
};
export const upgradeStorage = async (
  dataPath: string,
  books: BookModel[],
  toast: any
) => {
  //check if folder named cover exsits
  const fs = window.require("fs");
  const path = window.require("path");
  if (fs.existsSync(path.join(dataPath, "cover"))) {
    console.log("upgraded");
    return;
  }
  toast("Upgrading data");

  fs.mkdirSync(path.join(dataPath, "cover"));
  books.forEach((item) => {
    let cover = item.cover;
    if (cover) {
      let result = base64ToArrayBufferAndExtension(cover);
      fs.writeFileSync(
        path.join(dataPath, "cover", `${item.key}.${result.extension}`),
        Buffer.from(result.arrayBuffer)
      );
      item.cover = "";
    }
  });
  await window.localforage.setItem("books", books);
  //check if folder named book exsits, and loop each file and change file extension
  if (!fs.existsSync(path.join(dataPath, "book"))) {
    return;
  }
  const files = fs.readdirSync(path.join(dataPath, "book"));
  console.log(files);
  for (let i = 0; i < files.length; i++) {
    let fileName = files[i];
    let book = books.find((item) => item.key === fileName);
    if (book) {
      let newFileName = `${book.key}.${book.format.toLowerCase()}`;
      fs.renameSync(
        path.join(dataPath, "book", fileName),
        path.join(dataPath, "book", newFileName)
      );
    }
  }

  let plugins =
    localStorage.getItem("pluginList") !== "{}" &&
    localStorage.getItem("pluginList")
      ? JSON.parse(localStorage.getItem("pluginList") || "")
      : [];
  plugins.length > 0 && (await window.localforage.setItem("plugins", plugins));
  localStorage.deleteItem("pluginList");

  toast.success("Upgrade successful");
};
