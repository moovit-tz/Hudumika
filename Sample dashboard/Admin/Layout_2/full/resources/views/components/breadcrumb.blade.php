<!-- Page header -->
<div class="page-header">
    <div class="page-header-content d-lg-flex">
        <div class="d-flex">
            <h4 class="page-title mb-0">
                {{$title}} - <span class="fw-normal">{{$subtitle}}</span>
            </h4>

            <a href="#page_header" class="btn btn-light align-self-center collapsed d-lg-none border-transparent rounded-pill p-0 ms-auto" data-bs-toggle="collapse">
                <i class="ph-caret-down collapsible-indicator ph-sm m-1"></i>
            </a>
        </div>

        <div class="collapse d-lg-block my-lg-auto ms-lg-auto" id="page_header">
            <div class="d-sm-flex align-items-center mb-3 mb-lg-0 ms-lg-3">
                <div class="d-inline-flex align-items-center">
                    <a href="#" class="status-indicator-container ms-1">
                        <img src="{{URL::asset('assets/images/demo/users/face24.jpg')}}" class="w-32px h-32px rounded-pill" alt="">
                        <span class="status-indicator bg-warning"></span>
                    </a>
                    <a href="#" class="status-indicator-container ms-1">
                        <img src="{{URL::asset('assets/images/demo/users/face1.jpg')}}" class="w-32px h-32px rounded-pill" alt="">
                        <span class="status-indicator bg-success"></span>
                    </a>
                    <a href="#" class="status-indicator-container ms-1">
                        <img src="{{URL::asset('assets/images/demo/users/face3.jpg')}}" class="w-32px h-32px rounded-pill" alt="">
                        <span class="status-indicator bg-danger"></span>
                    </a>
                    <a href="#" class="status-indicator-container ms-1">
                        <img src="{{URL::asset('assets/images/demo/users/face5.jpg')}}" class="w-32px h-32px rounded-pill" alt="">
                        <span class="status-indicator bg-success"></span>
                    </a>

                    <div class="vr flex-shrink-0 my-1 mx-3"></div>

                    <a href="#" class="btn btn-primary btn-icon w-32px h-32px rounded-pill">
                        <i class="ph-plus"></i>
                    </a>

                    <div class="dropdown ms-2">
                        <a href="#" class="btn btn-light btn-icon w-32px h-32px rounded-pill" data-bs-toggle="dropdown">
                            <i class="ph-dots-three-vertical"></i>
                        </a>

                        <div class="dropdown-menu dropdown-menu-end">
                            <button type="button" class="dropdown-item">
                                <i class="ph-briefcase me-2"></i>
                                Customer details
                            </button>
                            <button type="button" class="dropdown-item">
                                <i class="ph-folder-user me-2"></i>
                                User directory
                            </button>
                            <button type="button" class="dropdown-item">
                                <i class="ph-user-gear me-2"></i>
                                Permissions
                            </button>
                            <div class="dropdown-divider"></div>
                            <button type="button" class="dropdown-item">
                                <i class="ph-users-four me-2"></i>
                                Manage users
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
<!-- /page header -->
