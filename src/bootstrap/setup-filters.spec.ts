import { setupFilters } from "@/bootstrap/setup-filters";
import { GlobalGqlExceptionFilter } from "@/common/filters/gql-exception.filter";

describe("setupFilters", () => {
  it("registers the global GraphQL exception filter", () => {
    const useGlobalFilters = jest.fn<void, [GlobalGqlExceptionFilter]>();
    const app = {
      useGlobalFilters,
    };

    setupFilters(app as never);

    const filter = useGlobalFilters.mock.calls[0]?.[0];

    expect(filter).toBeInstanceOf(GlobalGqlExceptionFilter);
  });
});
