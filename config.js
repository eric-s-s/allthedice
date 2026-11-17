function getLambdaEndpoint() {
  // run a dev server and change to this for local testing (`make local-dev` does it).
  //return 'http://localhost:8000/_construct';
  // production server
  return 'https://kpt1e43ea7.execute-api.us-east-1.amazonaws.com/default/_construct';
}
