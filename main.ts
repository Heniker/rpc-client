/*
TODO:
- Notification and Request can have different `params` type.
- Webpack-shim fetch for node-js build
*/

// https://www.jsonrpc.org/specification
import assert from 'assert'
import { nanoid } from 'nanoid'

type ValidIdT = string | number | null
type JSONValueT = string | number | boolean | null | JSONValueT[] | { [key: string]: JSONValueT }

interface BaseI<ID extends ValidIdT> {
  jsonrpc: '2.0'
  id: ID
}

interface RequestI<ID extends ValidIdT> extends BaseI<ID> {
  params?: JSONValueT
}
interface NotificationI extends Exclude<RequestI<never>, 'id'> {}

export interface ResponseSuccess<ID extends ValidIdT, RESULT extends JSONValueT> extends BaseI<ID> {
  result: RESULT
}

export interface ResponseError<ID extends ValidIdT, DATA extends JSONValueT> extends BaseI<ID> {
  error: {
    code: number
    message: string
    data?: DATA
  }
}

export class RpcHttpClient<
  REQUEST extends { [key: string]: JSONValueT | void } = {},
  RESPONSE extends { [key in keyof REQUEST]: JSONValueT } = Record<keyof REQUEST, any>,
  ERRORS extends { [key in keyof REQUEST]: JSONValueT } = Record<keyof REQUEST, any>
> {
  // #todo?> validate url
  constructor(
    public rpcUrl: string,
    private settings?: {
      /**
       * Throw if server response is not 200-299 code
       *
       * @default false
       * */
      strictServerResponse: boolean
    }
  ) {
    this.settings = Object.assign({ strictServerResponse: false }, this.settings)
  }

  async call<
    OK extends JSONValueT | void = void,
    ERROR extends JSONValueT | void = void,
    J extends keyof REQUEST = keyof REQUEST
  >(
    ...args: REQUEST[J] extends void
      ? [method: J | (string & {})]
      : [method: J | (string & {}), params: REQUEST[J]]
  ) {
    const method = args[0]
    const params = args[1]

    assert(method)

    const id = nanoid()

    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id, params, method }),
      headers: { 'Content-Type': 'application/json' },
    })

    this.settings.strictServerResponse && assert(response.ok)

    let responseData:
      | (OK extends JSONValueT
          ? ResponseSuccess<typeof id, OK>
          : ResponseSuccess<typeof id, RESPONSE[J]>)
      | (ERROR extends JSONValueT
          ? ResponseError<typeof id, ERROR>
          : ResponseError<typeof id, ERRORS[J]>)

    try {
      responseData = await response.json()
    } catch (err) {
      // #todo> handle spec violation in a grace way
      throw new Error('Response is not valid JSON.')
    }

    if ('error' in responseData) {
      throw responseData.error
    }

    if ('result' in responseData) {
      return responseData.result
    }
    // #todo>
    throw new Error('Response must have "error" or "result" properties.')
  }

  async notify<J extends keyof REQUEST = keyof REQUEST>(
    method: J,
    params?: REQUEST[J]
  ): Promise<void> {
    assert(method)

    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', params, method }),
      headers: { 'Content-Type': 'application/json' },
    })

    this.settings.strictServerResponse && assert(response.ok)
  }
}
