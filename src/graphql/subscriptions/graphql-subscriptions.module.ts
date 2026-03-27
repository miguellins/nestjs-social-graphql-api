import { Global, Module } from "@nestjs/common";

import { GraphqlPubSubService } from "@/graphql/subscriptions/graphql-pubsub.service";

@Global()
@Module({
  providers: [GraphqlPubSubService],
  exports: [GraphqlPubSubService],
})
export class GraphqlSubscriptionsModule {}
