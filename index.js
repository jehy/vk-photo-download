const path = require('path');
const fs = require('fs');
const Axios = require('axios')
const url = require('url');

const Iconv = require('iconv').Iconv;
const conv = Iconv('windows-1251', 'utf8');

async function downloadFile(fileUrl, outputLocationPath) {
    const writer = fs.createWriteStream(outputLocationPath);

    return Axios({
        method: 'get',
        url: fileUrl,
        responseType: 'stream',
    }).then(response => {

        //ensure that the user can call `then()` only when the file has
        //been downloaded entirely.

        return new Promise((resolve, reject) => {
            response.data.pipe(writer);
            let error = null;
            writer.on('error', err => {
                error = err;
                writer.close();
                reject(err);
            });
            writer.on('close', () => {
                if (!error) {
                    resolve(true);
                }
                //no need to call the reject here, as it will have been called in the
                //'error' stream;
            });
        });
    });
}

const dir = process.argv[2];
console.log(`fetching data from dir ${dir}`);

const albumsIndexPath = path.join(dir, '/photo-albums.html');
if (!fs.existsSync(albumsIndexPath)) {
    console.log(`${albumsIndexPath} does not exist!`);
    process.exit(1);
}
const albumIndexDataWin1251 = fs.readFileSync(albumsIndexPath);
const albumIndexData = conv.convert(albumIndexDataWin1251).toString('utf-8');
const albums = [...albumIndexData.matchAll(/<a href="photo-albums\/(.+).html">(.+)<\/a>/g)]
    .map((el) => {
        return {file: el[1], name: el[2]};
    });
// console.log((albums));

const images = albums.reduce((acc, item)=>{
    const albumPath = path.join(dir, `photo-albums/${item.file}.html`);
    if (!fs.existsSync(albumPath)) {
        console.log(`${albumPath} album file does not exist!`);
        process.exit(1);
    }
    const album = fs.readFileSync(albumPath, 'utf8');
    const images = [...album.matchAll(/<img src="(.+)" alt/g)].map((el)=>{
        return {src: el[1], name: item.name};
    });
    return acc.concat(images);
}, []);

console.log(images);

function getPhotoLocalName(remote){
    const parsed = url.parse(remote);
    return path.basename(parsed.pathname);
}

(async function() {
    const outPath = path.join(dir, `/output`);
    if(!fs.existsSync(outPath)){
        fs.mkdirSync(outPath);
    }
    for await (let image of images) {
        const albumPath = path.join(outPath, `/${image.name}`);
        if(!fs.existsSync(albumPath)){
            fs.mkdirSync(albumPath);
        }
        const photoPath = path.join(albumPath, getPhotoLocalName(image.src));
        if(fs.existsSync(photoPath)){
            continue;
        }
        console.log(`Downloading ${image.src} to ${photoPath}`);
        try {
            await downloadFile(image.src, photoPath);
            console.log('success!')
        } catch(err){
            console.log(`Fail: ${err.message}`);
        }
    }
})();
