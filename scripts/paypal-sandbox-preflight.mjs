import {pathToFileURL} from 'node:url';

export const SANDBOX_TOKEN_ENDPOINT='https://api-m.sandbox.paypal.com/v1/oauth2/token';

export async function runSandboxPreflight({env=process.env,fetcher=fetch}={}){
  const clientId=String(env.PAYPAL_CLIENT_ID||'').trim();
  const clientSecret=String(env.PAYPAL_CLIENT_SECRET||'');
  if(!clientId||!clientSecret)
    return {ok:false,reason:'MISSING_SANDBOX_CREDENTIALS'};
  if(clientId.length>1024||clientSecret.length>4096)
    return {ok:false,reason:'INVALID_CREDENTIAL_LENGTH'};
  let response;
  try {
    response=await fetcher(SANDBOX_TOKEN_ENDPOINT,{
      method:'POST',
      headers:{
        'Authorization':'Basic '+Buffer.from(clientId+':'+clientSecret).toString('base64'),
        'Content-Type':'application/x-www-form-urlencoded',
        'Accept':'application/json',
        'Cache-Control':'no-store'
      },
      body:'grant_type=client_credentials',
      signal:AbortSignal.timeout(12000),
      redirect:'error'
    });
  } catch {
    return {ok:false,reason:'SANDBOX_NETWORK_ERROR'};
  }
  if(!response.ok)
    return {ok:false,reason:'SANDBOX_AUTHENTICATION_REJECTED',httpStatus:response.status};
  let data;
  try{data=await response.json();}catch{
    return {ok:false,reason:'INVALID_SANDBOX_TOKEN_RESPONSE'};
  }
  // Only indicate that token issuance succeeded; never print/return the access token.
  if(typeof data.access_token!=='string'||!data.access_token)
    return {ok:false,reason:'SANDBOX_TOKEN_MISSING'};
  return {ok:true,reason:'SANDBOX_OAUTH_OK',environment:'SANDBOX_ONLY'};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const result=await runSandboxPreflight();
  process.stdout.write(JSON.stringify(result)+'\n');
  if(!result.ok)process.exitCode=1;
}
