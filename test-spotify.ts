import spotifyUrlInfo from 'spotify-url-info';
import fetch from 'isomorphic-unfetch';

const spotify = spotifyUrlInfo(fetch);

async function test() {
  try {
    const url = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'; // Today's Top Hits
    const data = await spotify.getTracks(url);
    if (data && data.length > 0) {
      console.log(`Successfully fetched ${data.length} tracks!`);
      // Print first track to see structure
      console.log(JSON.stringify(data[0], null, 2));
    } else {
      console.log('No tracks found.');
    }
  } catch (error) {
    console.error('Error fetching Spotify playlist:', error);
  }
}

test();
