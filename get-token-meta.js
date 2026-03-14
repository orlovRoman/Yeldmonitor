import { Connection, PublicKey } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';

const connection = new Connection("https://api.mainnet-beta.solana.com");
const metaplex = new Metaplex(connection);

const mints = [
  '34hCAWvkVsiSK8np5fED1CjMhKVUved8DpbdGnWJuopc',
  'GEcqNxrpRrUvY25AWNey1BoVWmkMnuRaYQKogxfQtvu1',

  'EyTuhyTjQvT7HfX1wtD6CrmysDRN9fj9iLjQLx6T5yMY',
  
  'ARZPrE5amV25J46R4mMEpyymR9syNcerxkk6yiwxdF5c',
  'F61gmVtqwJxYYZeEr9b3wx9mRfig5URpsTDzLKgaBpBu',

  'G9ua6b1da4Y4fDDKQHfwiLhPoYk2GRNGNTENANRoS3j3',
  'Ci2Wcvi4QcP2hT9L8PmehrVUwYNP5ZyAkZXHBdD34m18',

  '87U2u3HTkorq4QcbCeF9A6QFvziKoiNW6fwrGBUB53yQ',
  '7mx5hYYi5dxXcRJPkAa1nArp9cSDdFJsoTgtTHrEJ1Mx',

  'AWDJJXpke7tB8ER4ENnr2Kni5pYabFHEwX5VCAK4UFju',
  'FWYHVUTSxaHPKebmca1z5umkWbu1JUpN2goVH8sHDxAg',

  'HHUrm6pqDUYRr3m2FdmoinVFbMxFcjcGTYMxT4WuioMp',
  'A1LVUhHyYwSadQ5Gn9WmGif2cwknac57JmnjoqWm39yt',

  '6iVwqDcVqatTobV1Cf3A38Zgw8omDBqctbxDpYoBbpmo',
  '8pzBfLDRjdKosU4AeXFPGTJTjk8ChYTNgMENpPJMwK3c',

  '4Ab4ihcmiQ4TT8YAKTR9zD2sGvhihZak8W54Dk7FNuuQ',

  '6T1BRYFLs9H4wnwEYuqZfPs6bshAM9ZcaS976tDDGuD',
  '9HL5HvVmD6bnovRdra1wWhsfgsATZ2oqkEBvFs9e2Gfj',

  '63cJcwWtxgNqzg1CzEV2QsrJ3dZMqYgo69UaqUWHJrWG',
  '4w132pWqg2tnKRmYVgt3zGMvPNqurU665vmpNCqFhveK',

  'AnDgwcDvDYasprnrT6JzrNzr5FTmJRA7X6vWkAa8sW23',
  'KKzEWM4tsL1wvJhLaDqhygB6JGWVeVahqUpe6yDDAnZ',

  '5V5ApdsND3BZQ22kSvSQVefcQEgmkHiZa1Ymc2nNrPDA',

  '8H3tZ7WcgYPKEQ7fCCAFQuaNqKdMH1EtBp2ovUPpRK3k',
  'B4Wfhdk1Y3Y9pxw63w1pptpxypENm1987C1XAtgjc3Yf',
];

async function run() {
  for (const mint of mints) {
    try {
      const mintPubKey = new PublicKey(mint);
      const nft = await metaplex.nfts().findByMint({ mintAddress: mintPubKey });
      console.log(`'${mint}': { name: '${nft.name.trim()}', ticker: '${nft.symbol.trim()}' },`);
    } catch (e) {
      if (e.message && !e.message.includes('The account of type [Metadata] was not found')) {
         // console.log('Error on', mint, e.message.substring(0, 50));
      } else {
         // console.log('// Not found:', mint);
      }
    }
  }
}
run();
