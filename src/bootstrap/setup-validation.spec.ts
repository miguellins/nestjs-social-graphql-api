import { ValidationPipe } from "@nestjs/common";

import { setupValidation } from "@/bootstrap/setup-validation";

describe("setupValidation", () => {
  it("registers the global validation pipe with the expected options", () => {
    const useGlobalPipes = jest.fn<void, [ValidationPipe]>();
    const app = {
      useGlobalPipes,
    };

    setupValidation(app as never);

    const pipe = useGlobalPipes.mock.calls[0]?.[0];
    const internalPipe = pipe as unknown as {
      validatorOptions: Record<string, unknown>;
      isTransformEnabled: boolean;
    };

    expect(pipe).toBeInstanceOf(ValidationPipe);
    expect(internalPipe.validatorOptions).toEqual(
      expect.objectContaining({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    expect(internalPipe.isTransformEnabled).toBe(true);
  });
});
