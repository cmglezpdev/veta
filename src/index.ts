import youtubeDl from "youtube-dl-exec";

const url = "https://www.youtube.com/watch?v=aGnWRt6u-fg&list=WL&index=1";

const output = await youtubeDl(url, {
  dumpSingleJson: true,
  skipDownload: true,
  noPlaylist: true,
  writeSub: true,
  writeAutoSub: true,
  writeThumbnail: true,
  subLang: "en.*,es.*",
  subFormat: "json3",
});

console.log(JSON.stringify(output, null, 2));
