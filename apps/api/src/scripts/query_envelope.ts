import { dbPlatform } from '../db/client.js';

async function main() {
  const fileId = '37dbbae2-7a42-4456-b1a3-154d3c3d668f';
  const file = await dbPlatform.selectFrom('cloud_files')
    .selectAll()
    .where('id', '=', fileId)
    .executeTakeFirst();
  
  console.log('Cloud File in DB:');
  console.log(file);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
