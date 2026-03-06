
-- Function to validate LLM model is appropriate for the selected provider
CREATE OR REPLACE FUNCTION validate_agent_llm_config()
RETURNS TRIGGER AS $$
DECLARE
  provider TEXT;
  model TEXT;
BEGIN
  provider := NEW.config->'llm'->>'provider';
  model := NEW.config->'llm'->>'model';

  -- If either is missing, allow it (incomplete config during editing)
  IF provider IS NULL OR model IS NULL THEN
    RETURN NEW;
  END IF;

  -- Reject obvious cross-provider model names
  IF provider = 'groq' AND model LIKE 'gemini%' THEN
    RAISE EXCEPTION 'Invalid config: model "%" is a Google model and cannot be used with Groq provider. Use a valid Groq model such as llama-3.3-70b-versatile.', model;
  END IF;

  IF provider = 'groq' AND model LIKE 'gpt%' THEN
    RAISE EXCEPTION 'Invalid config: model "%" is an OpenAI model and cannot be used with Groq provider.', model;
  END IF;

  IF provider = 'openai' AND model LIKE 'gemini%' THEN
    RAISE EXCEPTION 'Invalid config: model "%" is a Google model and cannot be used with OpenAI provider.', model;
  END IF;

  IF provider = 'openai' AND model LIKE 'llama%' THEN
    RAISE EXCEPTION 'Invalid config: model "%" is a Meta/Groq model and cannot be used with OpenAI provider.', model;
  END IF;

  IF provider = 'gemini' AND model LIKE 'gpt%' THEN
    RAISE EXCEPTION 'Invalid config: model "%" is an OpenAI model and cannot be used with Gemini provider.', model;
  END IF;

  IF provider = 'gemini' AND model LIKE 'llama%' THEN
    RAISE EXCEPTION 'Invalid config: model "%" is a Meta model and cannot be used with Gemini provider.', model;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to agents table
DROP TRIGGER IF EXISTS validate_llm_config_trigger ON public.agents;
CREATE TRIGGER validate_llm_config_trigger
  BEFORE INSERT OR UPDATE ON public.agents
  FOR EACH ROW
  EXECUTE FUNCTION validate_agent_llm_config();
