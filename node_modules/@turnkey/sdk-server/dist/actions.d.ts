import { CreateOauthProvidersRequest, CreateOauthProvidersResponse, OauthLoginRequest, OauthLoginResponse, OtpLoginRequest, OtpLoginResponse, CreateSuborgRequest, CreateSuborgResponse, GetOrCreateSuborgRequest, GetOrCreateSuborgResponse, GetSuborgsRequest, GetSuborgsResponse, GetUsersRequest, GetUsersResponse, InitEmailAuthRequest, SendOtpRequest, SendOtpResponse, VerifyOtpRequest, VerifyOtpResponse } from "./__types__/base";
export declare function sendCredential(request: InitEmailAuthRequest): Promise<void>;
export declare function sendOtp(request: SendOtpRequest): Promise<SendOtpResponse | undefined>;
export declare function verifyOtp(request: VerifyOtpRequest): Promise<VerifyOtpResponse | undefined>;
export declare function otpLogin(request: OtpLoginRequest): Promise<OtpLoginResponse | undefined>;
export declare function oauthLogin(request: OauthLoginRequest): Promise<OauthLoginResponse | undefined>;
export declare function createOauthProviders(request: CreateOauthProvidersRequest): Promise<CreateOauthProvidersResponse | undefined>;
export declare function getUsers(request: GetUsersRequest): Promise<GetUsersResponse | undefined>;
export declare function getSuborgs(request: GetSuborgsRequest): Promise<GetSuborgsResponse>;
export declare function getVerifiedSuborgs(request: GetSuborgsRequest): Promise<GetSuborgsResponse>;
export declare function createSuborg(request: CreateSuborgRequest): Promise<CreateSuborgResponse | undefined>;
export declare function getOrCreateSuborg(request: GetOrCreateSuborgRequest): Promise<GetOrCreateSuborgResponse>;
//# sourceMappingURL=actions.d.ts.map