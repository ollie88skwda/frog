// `.sql` files are bundled as strings by Metro (resolver.sourceExts includes
// "sql"). Declare the module shape so TypeScript accepts the raw-SQL import in
// e2e/web/test-client.ts.
declare module "*.sql" {
  const content: string;
  export default content;
}
