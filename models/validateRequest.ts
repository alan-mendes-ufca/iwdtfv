import Joi from "joi";
import { ValidationError } from "infra/errors";

type Requirement = "required" | "optional";
type SchemaKey = keyof typeof schemas;
type Keys = Partial<Record<SchemaKey, Requirement>>;

export default function validateRequest<T extends Record<string, unknown>>(
  object: unknown,
  keys: Keys,
): T {
  const normalizedObject = normalizeJsonObject(object);

  let finalSchema = Joi.object().required().min(1).messages({
    "object.base": "Valor enviado deve ser do tipo object.",
    "object.min": "Objeto enviado deve ter no mínimo uma chave.",
    "any.required": "Corpo da requisição é obrigatório.",
  });

  for (const key of Object.keys(keys) as SchemaKey[]) {
    finalSchema = finalSchema.concat(schemas[key]());
  }

  const { error, value } = finalSchema.validate(normalizedObject, {
    stripUnknown: true,
    context: {
      required: keys,
    },
  });

  if (error) {
    throw new ValidationError({
      message: error.details[0]?.message,
    });
  }
  return value as T;

  function normalizeJsonObject(object: unknown) {
    try {
      return object === undefined
        ? undefined
        : JSON.parse(JSON.stringify(object));
    } catch {
      throw new ValidationError({
        message: "Não foi possível interpretar o valor enviado.",
        action: "Verifique se o valor enviado é um JSON válido.",
      });
    }
  }
}

const schemas = {
  url: function () {
    return Joi.object({
      url: Joi.string()
        .trim()
        .max(2048)
        .uri({ scheme: ["http", "https"] })
        .invalid(null)
        .when("$required.url", {
          is: "required",
          then: Joi.required(),
          otherwise: Joi.optional(),
        })
        .messages({
          "any.required": `"url" é um campo obrigatório.`,
          "string.empty": `"url" não pode estar em branco.`,
          "string.base": `"url" deve ser do tipo String.`,
          "string.max": `"url" deve conter no máximo {#limit} caracteres.`,
          "string.uri": `"url" deve ser um link válido.`,
          "string.uriCustomScheme": `"url" deve começar com http:// ou https://.`,
          "any.invalid": `"url" possui o valor inválido "null".`,
        }),
    });
  },

  format_id: function () {
    return Joi.object({
      format_id: Joi.string()
        .trim()
        .pattern(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/)
        .invalid(null)
        .when("$required.format_id", {
          is: "required",
          then: Joi.required(),
          otherwise: Joi.optional(),
        })
        .messages({
          "any.required": `"format_id" é um campo obrigatório.`,
          "string.empty": `"format_id" não pode estar em branco.`,
          "string.base": `"format_id" deve ser do tipo String.`,
          "string.pattern.base": `"format_id" deve ser "audio" ou o id de um formato válido.`,
          "any.invalid": `"format_id" possui o valor inválido "null".`,
        }),
    });
  },
};
